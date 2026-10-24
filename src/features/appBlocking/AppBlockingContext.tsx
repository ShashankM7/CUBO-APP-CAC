import AsyncStorage from '@react-native-async-storage/async-storage';
import { Timestamp, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, type QuerySnapshot } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { blockingSummary, makeBlockingPolicy, policyForAccountType, type AppBlockingPolicy } from './policy';
import type { BlockAppDef } from '../../data/blockApps';
import { mergeAppBlocking, normalizeAppBlocking, type SyncedAppBlocking } from '../sync/domainData';
import { useAccountSyncBridge } from '../sync/useAccountSyncBridge';
import { db } from '../../lib/firebase';

export type AppBlockingNotice = { id: string; targetUid: string; targetName: string; title: string; body: string; createdAt: string; read: boolean };
export type DriveBlockPlan = { policy: AppBlockingPolicy; apps: BlockAppDef[] };
type Stored = SyncedAppBlocking;
type Value = {
  hydrated: boolean;
  policyFor: (targetUid?: string, targetName?: string) => AppBlockingPolicy;
  savePolicy: (policy: AppBlockingPolicy, parentManaged?: boolean, connectionId?: string) => Promise<void>;
  beginDrive: () => DriveBlockPlan | null;
  endDrive: () => void;
  activePlan: DriveBlockPlan | null;
  notices: AppBlockingNotice[];
  markNoticesRead: (id?: string) => void;
};
const Context = createContext<Value | null>(null);

export function AppBlockingProvider({ children }: { children: ReactNode }) {
  const { user, accountDetails } = useAuth();
  const [owner, setOwner] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [hasLocalRecord, setHasLocalRecord] = useState(false);
  const [policies, setPolicies] = useState<Record<string, AppBlockingPolicy>>({});
  const [familyPolicies, setFamilyPolicies] = useState<Record<string, AppBlockingPolicy>>({});
  const [notices, setNotices] = useState<AppBlockingNotice[]>([]);
  const [activePlan, setActivePlan] = useState<DriveBlockPlan | null>(null);
  useEffect(() => {
    let mounted = true; setHydrated(false); setHasLocalRecord(false); setOwner(null); setPolicies({}); setFamilyPolicies({}); setNotices([]); setActivePlan(null);
    if (!user) return;
    void AsyncStorage.getItem(`cubo-app-blocking:${user.uid}`).then(raw => {
      if (!mounted) return;
      if (raw) {
        const value = JSON.parse(raw) as Partial<Stored>;
        const next: Record<string, AppBlockingPolicy> = {};
        Object.entries(value.policies ?? {}).forEach(([uid, policy]) => { next[uid] = makeBlockingPolicy(uid, policy.targetName, policy); });
        setPolicies(next); setNotices(Array.isArray(value.notices) ? value.notices.slice(0, 30) : []);
        setHasLocalRecord(true);
      }
      setOwner(user.uid); setHydrated(true);
    }).catch(() => { if (mounted) { setOwner(user.uid); setHydrated(true); } });
    return () => { mounted = false; };
  }, [user?.uid]);
  useEffect(() => {
    setFamilyPolicies({});
    if (!user || !hydrated) return;
    const organized = query(collection(db, 'familyAppPolicies'), where('organizerUid', '==', user.uid));
    const assigned = query(collection(db, 'familyAppPolicies'), where('minorUid', '==', user.uid));
    let organizedPolicies: Record<string, AppBlockingPolicy> = {};
    let assignedPolicies: Record<string, AppBlockingPolicy> = {};
    const merge = () => setFamilyPolicies({ ...organizedPolicies, ...assignedPolicies });
    const mapSnapshot = (snapshot: QuerySnapshot) => Object.fromEntries(snapshot.docs.map(item => {
      const data = item.data();
      const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : '';
      return [item.id, makeBlockingPolicy(item.id, data.targetName, { enabled: data.enabled, lockedByParent: data.lockedByParent, selectedIds: data.selectedIds, updatedAt })];
    }));
    const addMinorNotice = (next: Record<string, AppBlockingPolicy>) => {
      if (accountDetails?.accountType === 'adult') return;
      const policy = next[user.uid];
      if (!policy?.updatedAt) return;
      const id = `family-block-${policy.updatedAt}`;
      setNotices(current => current.some(item => item.id === id) ? current : [{
        id,
        targetUid: user.uid,
        targetName: policy.targetName,
        title: 'Your Blocked Apps were updated',
        body: `Your family organizer selected ${policy.selectedIds.length} app${policy.selectedIds.length === 1 ? '' : 's'}${policy.lockedByParent ? ' and turned on Child Lock' : ''}. Open Blocked Apps to review the list.`,
        createdAt: policy.updatedAt,
        read: false,
      }, ...current].slice(0, 30));
    };
    const unsubs = [
      onSnapshot(
        organized,
        snapshot => { organizedPolicies = mapSnapshot(snapshot); merge(); },
        () => { organizedPolicies = {}; merge(); },
      ),
      onSnapshot(
        assigned,
        snapshot => { assignedPolicies = mapSnapshot(snapshot); merge(); addMinorNotice(assignedPolicies); },
        () => { assignedPolicies = {}; merge(); },
      ),
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [accountDetails?.accountType, hydrated, user?.uid]);
  useEffect(() => {
    if (!hydrated || !user || accountDetails?.accountType !== 'adult') return;
    setPolicies(current => {
      const own = current[user.uid];
      if (!own?.lockedByParent) return current;
      return { ...current, [user.uid]: policyForAccountType(own, 'adult') };
    });
    const assigned = familyPolicies[user.uid];
    if (!assigned) return;
    setPolicies(current => current[user.uid] ? current : { ...current, [user.uid]: policyForAccountType(assigned, 'adult') });
    void deleteDoc(doc(db, 'familyAppPolicies', user.uid)).catch(() => undefined);
  }, [accountDetails?.accountType, familyPolicies, hydrated, user?.uid]);
  useEffect(() => {
    if (!hydrated || !user || owner !== user.uid) return;
    const value: Stored = { version: 1, policies, notices: notices.slice(0, 30) };
    void AsyncStorage.setItem(`cubo-app-blocking:${user.uid}`, JSON.stringify(value)).catch(() => undefined);
  }, [hydrated, owner, user?.uid, policies, notices]);
  const synced: Stored = useMemo(() => ({ version: 1, policies, notices: notices.slice(0, 30) }), [policies, notices]);
  useAccountSyncBridge({
    uid: user?.uid,
    domain: 'blockedApps',
    ready: hydrated && owner === user?.uid,
    value: synced,
    normalize: normalizeAppBlocking,
    merge: mergeAppBlocking,
    mergeInitial: hasLocalRecord,
    onRemote: value => {
      setPolicies(value.policies);
      setNotices(current => mergeAppBlocking(
        { version: 1, policies: {}, notices: current },
        { version: 1, policies: {}, notices: value.notices },
      ).notices);
    },
  });
  const policyFor = useCallback((targetUid = user?.uid ?? 'signed-out', targetName = user?.displayName ?? 'You') => {
    const policy = makeBlockingPolicy(targetUid, targetName, familyPolicies[targetUid] ?? policies[targetUid]);
    return targetUid === user?.uid ? policyForAccountType(policy, accountDetails?.accountType) : policy;
  }, [accountDetails?.accountType, familyPolicies, policies, user?.uid, user?.displayName]);
  const savePolicy = useCallback(async (input: AppBlockingPolicy, parentManaged = false, connectionId?: string) => {
    if (!user || owner !== user.uid) return;
    const policy = policyForAccountType(makeBlockingPolicy(input.targetUid, input.targetName, { ...input, lockedByParent: parentManaged && input.lockedByParent, updatedAt: new Date().toISOString() }), input.targetUid === user.uid ? accountDetails?.accountType : undefined);
    if (parentManaged) {
      if (!connectionId) throw Error('This family connection is not ready for parent controls.');
      const reference = doc(db, 'familyAppPolicies', policy.targetUid);
      if (familyPolicies[policy.targetUid]) await updateDoc(reference, { targetName: policy.targetName, enabled: policy.enabled, lockedByParent: policy.lockedByParent, selectedIds: policy.selectedIds, updatedAt: serverTimestamp() });
      else await setDoc(reference, { minorUid: policy.targetUid, organizerUid: user.uid, connectionId, targetName: policy.targetName, enabled: policy.enabled, lockedByParent: policy.lockedByParent, selectedIds: policy.selectedIds, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setFamilyPolicies(current => ({ ...current, [policy.targetUid]: policy }));
      return;
    }
    const assignedPolicy = accountDetails?.accountType === 'adult' ? undefined : familyPolicies[user.uid];
    if (policy.targetUid === user.uid && assignedPolicy) {
      if (assignedPolicy.lockedByParent) throw Error('Child Lock is on. Your family organizer controls this list.');
      await updateDoc(doc(db, 'familyAppPolicies', user.uid), { enabled: policy.enabled, selectedIds: policy.selectedIds, updatedAt: serverTimestamp() });
      setFamilyPolicies(current => ({ ...current, [user.uid]: { ...assignedPolicy, enabled: policy.enabled, selectedIds: policy.selectedIds, updatedAt: policy.updatedAt } }));
      return;
    }
    setPolicies(current => ({ ...current, [policy.targetUid]: policy }));
  }, [accountDetails?.accountType, familyPolicies, owner, user?.uid]);
  const beginDrive = useCallback(() => {
    if (!user || owner !== user.uid) return null;
    const policy = policyForAccountType(makeBlockingPolicy(user.uid, user.displayName ?? 'You', familyPolicies[user.uid] ?? policies[user.uid]), accountDetails?.accountType);
    const apps = blockingSummary(policy);
    const plan = apps.length ? { policy, apps } : null;
    setActivePlan(plan); return plan;
  }, [accountDetails?.accountType, familyPolicies, owner, policies, user?.uid, user?.displayName]);
  const endDrive = useCallback(() => setActivePlan(null), []);
  const markNoticesRead = useCallback((id?: string) => setNotices(current => current.map(item => !id || item.id === id ? { ...item, read: true } : item)), []);
  const value = useMemo<Value>(() => ({ hydrated, policyFor, savePolicy, beginDrive, endDrive, activePlan, notices, markNoticesRead }), [hydrated, policyFor, savePolicy, beginDrive, endDrive, activePlan, notices, markNoticesRead]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAppBlocking() { const value = useContext(Context); if (!value) throw Error('AppBlockingProvider missing'); return value; }
