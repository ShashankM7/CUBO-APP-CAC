import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { blockingSummary, makeBlockingPolicy, type AppBlockingPolicy } from './policy';
import type { BlockAppDef } from '../../data/blockApps';

export type AppBlockingNotice = { id: string; targetUid: string; targetName: string; title: string; body: string; createdAt: string; read: boolean };
export type DriveBlockPlan = { policy: AppBlockingPolicy; apps: BlockAppDef[] };
type Stored = { version: 1; policies: Record<string, AppBlockingPolicy>; notices: AppBlockingNotice[] };
type Value = {
  hydrated: boolean;
  policyFor: (targetUid?: string, targetName?: string) => AppBlockingPolicy;
  savePolicy: (policy: AppBlockingPolicy, parentManaged?: boolean) => void;
  beginDrive: () => DriveBlockPlan | null;
  endDrive: () => void;
  activePlan: DriveBlockPlan | null;
  notices: AppBlockingNotice[];
  markNoticesRead: (id?: string) => void;
};
const Context = createContext<Value | null>(null);

export function AppBlockingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [owner, setOwner] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [policies, setPolicies] = useState<Record<string, AppBlockingPolicy>>({});
  const [notices, setNotices] = useState<AppBlockingNotice[]>([]);
  const [activePlan, setActivePlan] = useState<DriveBlockPlan | null>(null);
  useEffect(() => {
    let mounted = true; setHydrated(false); setOwner(null); setPolicies({}); setNotices([]); setActivePlan(null);
    if (!user) return;
    void AsyncStorage.getItem(`cubo-app-blocking:${user.uid}`).then(raw => {
      if (!mounted) return;
      if (raw) {
        const value = JSON.parse(raw) as Partial<Stored>;
        const next: Record<string, AppBlockingPolicy> = {};
        Object.entries(value.policies ?? {}).forEach(([uid, policy]) => { next[uid] = makeBlockingPolicy(uid, policy.targetName, policy); });
        setPolicies(next); setNotices(Array.isArray(value.notices) ? value.notices.slice(0, 30) : []);
      }
      setOwner(user.uid); setHydrated(true);
    }).catch(() => { if (mounted) { setOwner(user.uid); setHydrated(true); } });
    return () => { mounted = false; };
  }, [user?.uid]);
  useEffect(() => {
    if (!hydrated || !user || owner !== user.uid) return;
    const value: Stored = { version: 1, policies, notices: notices.slice(0, 30) };
    void AsyncStorage.setItem(`cubo-app-blocking:${user.uid}`, JSON.stringify(value)).catch(() => undefined);
  }, [hydrated, owner, user?.uid, policies, notices]);
  const policyFor = useCallback((targetUid = user?.uid ?? 'signed-out', targetName = user?.displayName ?? 'You') => makeBlockingPolicy(targetUid, targetName, policies[targetUid]), [policies, user?.uid, user?.displayName]);
  const savePolicy = useCallback((input: AppBlockingPolicy, parentManaged = false) => {
    if (!user || owner !== user.uid) return;
    const policy = makeBlockingPolicy(input.targetUid, input.targetName, { ...input, lockedByParent: parentManaged && input.lockedByParent, updatedAt: new Date().toISOString() });
    setPolicies(current => ({ ...current, [policy.targetUid]: policy }));
    if (parentManaged) setNotices(current => [{ id: `block-${Date.now()}`, targetUid: policy.targetUid, targetName: policy.targetName, title: 'Blocked Apps updated', body: `${policy.targetName}'s drive list now includes ${policy.selectedIds.length} app${policy.selectedIds.length === 1 ? '' : 's'}${policy.lockedByParent ? ' with Child Lock on' : ''}. This is a notification preview until family sync and phone controls are connected.`, createdAt: new Date().toISOString(), read: false }, ...current].slice(0, 30));
  }, [owner, user?.uid]);
  const beginDrive = useCallback(() => {
    if (!user || owner !== user.uid) return null;
    const policy = makeBlockingPolicy(user.uid, user.displayName ?? 'You', policies[user.uid]);
    const apps = blockingSummary(policy);
    const plan = apps.length ? { policy, apps } : null;
    setActivePlan(plan); return plan;
  }, [owner, policies, user?.uid, user?.displayName]);
  const endDrive = useCallback(() => setActivePlan(null), []);
  const markNoticesRead = useCallback((id?: string) => setNotices(current => current.map(item => !id || item.id === id ? { ...item, read: true } : item)), []);
  const value = useMemo<Value>(() => ({ hydrated, policyFor, savePolicy, beginDrive, endDrive, activePlan, notices, markNoticesRead }), [hydrated, policyFor, savePolicy, beginDrive, endDrive, activePlan, notices, markNoticesRead]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAppBlocking() { const value = useContext(Context); if (!value) throw Error('AppBlockingProvider missing'); return value; }
