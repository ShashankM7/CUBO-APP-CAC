import * as Location from 'expo-location';
import { Timestamp, collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { db } from '../../lib/firebase';
import { useAuth } from '../auth/AuthContext';
import { useDrives } from '../drives/DriveContext';
import type { AccountDetails } from '../auth/accountDetails';
import { connectionPairId, dedupeConnections } from './connectionIdentity';
import { defaultAvatarId, isAvatarId, type AvatarId } from '../profile/avatars';

export type ConnectionKind = 'family' | 'friend';
export type ConnectionRequest = {
  id: string;
  code: string;
  kind: ConnectionKind;
  ownerUid: string;
  ownerName: string;
  ownerAvatarId?: AvatarId;
  requesterUid: string;
  requesterName: string;
  requesterAvatarId?: AvatarId;
  requesterAccountType: 'minor' | 'adult';
  status: 'pending' | 'approved' | 'declined';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};
export type CuboConnection = {
  id: string;
  requestId?: string;
  kind: ConnectionKind;
  ownerUid: string;
  ownerName: string;
  ownerAvatarId?: AvatarId;
  ownerAccountType?: 'minor' | 'adult';
  memberUid: string;
  memberName: string;
  memberAvatarId?: AvatarId;
  memberAccountType: 'minor' | 'adult';
  ownerShareScore: boolean;
  ownerShareLocation: boolean;
  memberShareScore: boolean;
  memberShareLocation: boolean;
  ownerScore: number | null;
  memberScore: number | null;
  ownerScoreMeasured?: boolean;
  memberScoreMeasured?: boolean;
  ownerLatitude: number | null;
  ownerLongitude: number | null;
  ownerLocationAt: Timestamp | null;
  memberLatitude: number | null;
  memberLongitude: number | null;
  memberLocationAt: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};
export type BirthDateChangeRequest = {
  id: string;
  connectionId: string;
  organizerUid: string;
  organizerName: string;
  minorUid: string;
  minorName: string;
  previousBirthDate: string;
  requestedBirthDate: string;
  requestedAccountType: 'minor' | 'adult';
  status: 'pending' | 'approved' | 'denied';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};
export type LocationShareRequest = {
  id: string;
  connectionId: string;
  organizerUid: string;
  organizerName: string;
  minorUid: string;
  minorName: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};
type ShareKey = 'score' | 'location';
type CreatedCode = { code: string; expiresAt: Date; kind: ConnectionKind };
type ConnectionContextValue = {
  connections: CuboConnection[];
  incoming: ConnectionRequest[];
  outgoing: ConnectionRequest[];
  birthDateRequests: BirthDateChangeRequest[];
  locationShareRequests: LocationShareRequest[];
  loading: boolean;
  error: string;
  canGenerateFamilyCode: boolean;
  createCode: (kind: ConnectionKind) => Promise<CreatedCode>;
  enterCode: (code: string, expectedKind: ConnectionKind) => Promise<ConnectionRequest>;
  approveRequest: (request: ConnectionRequest) => Promise<void>;
  declineRequest: (request: ConnectionRequest) => Promise<void>;
  setSharing: (connection: CuboConnection, key: ShareKey, enabled: boolean) => Promise<void>;
  removeConnection: (connection: CuboConnection) => Promise<void>;
  requestBirthDateChange: (details: AccountDetails) => Promise<void>;
  reviewBirthDateChange: (request: BirthDateChangeRequest, approved: boolean) => Promise<void>;
  requestLocationShare: (connection: CuboConnection) => Promise<void>;
  respondLocationShare: (request: LocationShareRequest, approved: boolean) => Promise<void>;
  reconcileOwnAccountRole: (nextType: AccountDetails['accountType']) => Promise<{ removedFamilyConnections: number }>;
};

const ConnectionContext = createContext<ConnectionContextValue | null>(null);
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function makeCode(kind: ConnectionKind) {
  const values = new Uint32Array(8);
  globalThis.crypto.getRandomValues(values);
  const body = Array.from(values, value => alphabet[value % alphabet.length]).join('');
  return `${kind === 'family' ? 'F' : 'R'}-${body.slice(0, 4)}-${body.slice(4)}`;
}
function normalizeCode(value: string) {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length !== 9 || !['F', 'R'].includes(compact[0])) throw Error('Enter a valid CUBO code.');
  return `${compact[0]}-${compact.slice(1, 5)}-${compact.slice(5)}`;
}
function averageScore(sessions: ReturnType<typeof useDrives>['sessions']) {
  const scored = sessions.filter(item => item.attentionMeasured);
  return scored.length ? Math.round(scored.reduce((sum, item) => sum + item.focusScore, 0) / scored.length) : 100;
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const { user, accountDetails } = useAuth();
  const { sessions } = useDrives();
  const [rawConnections, setRawConnections] = useState<CuboConnection[]>([]);
  const connections = useMemo(() => dedupeConnections(rawConnections), [rawConnections]);
  const [rawIncoming, setRawIncoming] = useState<ConnectionRequest[]>([]);
  const [rawOutgoing, setRawOutgoing] = useState<ConnectionRequest[]>([]);
  const incoming = useMemo(() => rawIncoming.filter(item => item.status === 'pending'), [rawIncoming]);
  const outgoing = useMemo(() => rawOutgoing.filter(item => item.status === 'pending'), [rawOutgoing]);
  const [requestSnapshotsReady, setRequestSnapshotsReady] = useState({ incoming: false, outgoing: false });
  const [birthDateRequests, setBirthDateRequests] = useState<BirthDateChangeRequest[]>([]);
  const [locationShareRequests, setLocationShareRequests] = useState<LocationShareRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setRawConnections([]); setRawIncoming([]); setRawOutgoing([]); setRequestSnapshotsReady({ incoming: false, outgoing: false }); setBirthDateRequests([]); setLocationShareRequests([]); setError('');
    if (!user) return;
    const incomingQuery = query(collection(db, 'connectionRequests'), where('ownerUid', '==', user.uid));
    const outgoingQuery = query(collection(db, 'connectionRequests'), where('requesterUid', '==', user.uid));
    const ownedQuery = query(collection(db, 'connections'), where('ownerUid', '==', user.uid));
    const joinedQuery = query(collection(db, 'connections'), where('memberUid', '==', user.uid));
    const organizedBirthChanges = query(collection(db, 'birthDateChangeRequests'), where('organizerUid', '==', user.uid));
    const requestedBirthChanges = query(collection(db, 'birthDateChangeRequests'), where('minorUid', '==', user.uid));
    const organizedLocationRequests = query(collection(db, 'locationShareRequests'), where('organizerUid', '==', user.uid));
    const receivedLocationRequests = query(collection(db, 'locationShareRequests'), where('minorUid', '==', user.uid));
    let owned: CuboConnection[] = []; let joined: CuboConnection[] = [];
    let organized: BirthDateChangeRequest[] = []; let requested: BirthDateChangeRequest[] = [];
    let locationRequested: LocationShareRequest[] = []; let locationReceived: LocationShareRequest[] = [];
    const merge = () => setRawConnections([...owned, ...joined].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index));
    const mergeBirthChanges = () => setBirthDateRequests([...organized, ...requested].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index));
    const mergeLocationRequests = () => setLocationShareRequests([...locationRequested, ...locationReceived].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index));
    const unsubs = [
      onSnapshot(incomingQuery, snap => { setRawIncoming(snap.docs.map(item => ({ id: item.id, ...item.data() } as ConnectionRequest))); setRequestSnapshotsReady(value => ({ ...value, incoming: true })); }, cause => setError(cause.message)),
      onSnapshot(outgoingQuery, snap => { setRawOutgoing(snap.docs.map(item => ({ id: item.id, ...item.data() } as ConnectionRequest))); setRequestSnapshotsReady(value => ({ ...value, outgoing: true })); }, cause => setError(cause.message)),
      onSnapshot(ownedQuery, snap => { owned = snap.docs.map(item => ({ id: item.id, ...item.data() } as CuboConnection)); merge(); }, cause => setError(cause.message)),
      onSnapshot(joinedQuery, snap => { joined = snap.docs.map(item => ({ id: item.id, ...item.data() } as CuboConnection)); merge(); }, cause => setError(cause.message)),
      onSnapshot(organizedBirthChanges, snap => { organized = snap.docs.map(item => ({ id: item.id, ...item.data() } as BirthDateChangeRequest)); mergeBirthChanges(); }, cause => setError(cause.message)),
      onSnapshot(requestedBirthChanges, snap => { requested = snap.docs.map(item => ({ id: item.id, ...item.data() } as BirthDateChangeRequest)); mergeBirthChanges(); }, cause => setError(cause.message)),
      onSnapshot(organizedLocationRequests, snap => { locationRequested = snap.docs.map(item => ({ id: item.id, ...item.data() } as LocationShareRequest)); mergeLocationRequests(); }, cause => setError(cause.message)),
      onSnapshot(receivedLocationRequests, snap => { locationReceived = snap.docs.map(item => ({ id: item.id, ...item.data() } as LocationShareRequest)); mergeLocationRequests(); }, cause => setError(cause.message)),
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [user?.uid]);

  // Older builds used a random request ID as the connection ID. Keep the most
  // recently updated relationship and remove older duplicates once per pair.
  useEffect(() => {
    if (!user) return;
    const groups = new Map<string, CuboConnection[]>();
    for (const item of rawConnections) {
      const key = connectionPairId(item.kind, item.ownerUid, item.memberUid);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const items of groups.values()) {
      if (items.length < 2) continue;
      const keep = dedupeConnections(items)[0];
      const firstUid = keep.ownerUid < keep.memberUid ? keep.ownerUid : keep.memberUid;
      if (user.uid !== firstUid) continue;
      void Promise.all(items.filter(item => item.id !== keep.id).map(item => deleteDoc(doc(db, 'connections', item.id)))).catch(() => setError('A duplicate connection is hidden but could not be cleaned up yet. Try again while online.'));
    }
  }, [rawConnections, user?.uid]);

  // Backfill the protected family-membership marker for links created by older
  // builds. It keeps every linked member's age change behind organizer approval.
  useEffect(() => {
    if (!user) return;
    for (const item of connections) {
      if (item.kind !== 'family') continue;
      void setDoc(doc(db, 'familyMemberships', item.memberUid), {
        minorUid: item.memberUid,
        organizerUid: item.ownerUid,
        connectionId: item.id,
        createdAt: item.createdAt ?? serverTimestamp(),
      }).catch(() => undefined);
    }
  }, [connections, user?.uid]);

  const currentScore = useMemo(() => averageScore(sessions), [sessions]);
  const currentScoreMeasured = useMemo(() => sessions.some(item => item.attentionMeasured), [sessions]);
  useEffect(() => {
    if (!user) return;
    for (const item of connections) {
      const owner = item.ownerUid === user.uid;
      const requiredFamilyScore = item.kind === 'family' && item.memberUid === user.uid && item.memberAccountType === 'minor';
      const storedEnabled = owner ? item.ownerShareScore : item.memberShareScore;
      const enabled = requiredFamilyScore || storedEnabled;
      const saved = owner ? item.ownerScore : item.memberScore;
      const savedMeasured = owner ? item.ownerScoreMeasured : item.memberScoreMeasured;
      if (!enabled || (storedEnabled && saved === currentScore && savedMeasured === currentScoreMeasured)) continue;
      const prefix = owner ? 'owner' : 'member';
      void updateDoc(doc(db, 'connections', item.id), { [`${prefix}ShareScore`]: true, [`${prefix}Score`]: currentScore, [`${prefix}ScoreMeasured`]: currentScoreMeasured, updatedAt: serverTimestamp() }).catch(() => setError('Your shared safety score could not refresh yet.'));
    }
  }, [connections, currentScore, currentScoreMeasured, user?.uid]);

  const canGenerateFamilyCode = accountDetails?.accountType === 'adult' && !connections.some(item => item.kind === 'family' && item.memberUid === user?.uid);
  const loadIdentity = useCallback(async () => {
    if (!user) throw Error('Sign in before continuing.');
    const snapshot = await getDoc(doc(db, 'users', user.uid));
    const data = snapshot.data();
    if (!snapshot.exists() || typeof data?.name !== 'string' || !data.accountDetails) throw Error('Finish setting up your CUBO profile before continuing.');
    return { name: data.name as string, avatarId: isAvatarId(data.avatarId) ? data.avatarId : defaultAvatarId(user.uid), details: data.accountDetails as AccountDetails };
  }, [user?.uid]);
  const createCode = useCallback(async (kind: ConnectionKind) => {
    if (!user) throw Error('Sign in before creating a code.');
    const identity = await loadIdentity();
    if (kind === 'family' && identity.details.accountType === 'minor') throw Error('You’re signed in as a minor and are not eligible to generate a Family code. Ask an adult organizer to create one for you.');
    if (kind === 'family' && !canGenerateFamilyCode) throw Error('Only the family organizer can create another Family code.');
    setLoading(true); setError('');
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const code = makeCode(kind);
        const reference = doc(db, 'connectionCodes', code);
        if ((await getDoc(reference)).exists()) continue;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await setDoc(reference, { code, kind, ownerUid: user.uid, ownerName: identity.name, ownerAvatarId: identity.avatarId, status: 'active', createdAt: serverTimestamp(), expiresAt: Timestamp.fromDate(expiresAt) });
        return { code, expiresAt, kind };
      }
      throw Error('Could not reserve a code. Try again.');
    } finally { setLoading(false); }
  }, [canGenerateFamilyCode, loadIdentity, user?.uid]);

  const enterCode = useCallback(async (rawCode: string, expectedKind: ConnectionKind) => {
    if (!user) throw Error('Finish setting up your account before joining.');
    const code = normalizeCode(rawCode);
    setLoading(true); setError('');
    try {
      const identity = await loadIdentity();
      const codeSnap = await getDoc(doc(db, 'connectionCodes', code));
      if (!codeSnap.exists()) throw Error('That code was not found. Check it and try again.');
      const data = codeSnap.data();
      if (data.status !== 'active' || !(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now()) throw Error('That code expired. Ask for a new one.');
      if (data.kind !== expectedKind) throw Error(`This is a ${data.kind === 'family' ? 'Family' : 'Friend'} code. Switch to ${data.kind === 'family' ? 'Family' : 'Friends'} to use it.`);
      if (data.ownerUid === user.uid) throw Error('That is your own code. Share it with someone else.');
      if (!requestSnapshotsReady.incoming || !requestSnapshotsReady.outgoing) throw Error('Your connections are still syncing. Try again in a moment.');
      const requestId = connectionPairId(data.kind, data.ownerUid, user.uid);
      if (connections.some(item => item.kind === data.kind && connectionPairId(item.kind, item.ownerUid, item.memberUid) === requestId)) throw Error(`This person is already in your ${data.kind === 'family' ? 'family' : 'friends'}.`);
      const previous = [...rawIncoming, ...rawOutgoing].find(item => item.id === requestId);
      if (previous?.status === 'pending') throw Error('A request between these accounts is already waiting for approval.');
      if (previous?.status === 'approved') throw Error(`This person is already in your ${data.kind === 'family' ? 'family' : 'friends'}.`);
      const request: Omit<ConnectionRequest, 'id'> = { code, kind: data.kind, ownerUid: data.ownerUid, ownerName: data.ownerName, ownerAvatarId: isAvatarId(data.ownerAvatarId) ? data.ownerAvatarId : defaultAvatarId(data.ownerUid), requesterUid: user.uid, requesterName: identity.name, requesterAvatarId: identity.avatarId, requesterAccountType: identity.details.accountType, status: 'pending' };
      // Do not getDoc() this deterministic path first. A missing request has no
      // participant fields for Firestore to authorize, so probing it is denied.
      // The participant-scoped realtime queries above are the authoritative
      // duplicate/status source and never expose another account's requests.
      if (previous?.status === 'declined') await updateDoc(doc(db, 'connectionRequests', requestId), { ...request, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      else await setDoc(doc(db, 'connectionRequests', requestId), { ...request, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return { id: requestId, ...request };
    } finally { setLoading(false); }
  }, [connections, loadIdentity, rawIncoming, rawOutgoing, requestSnapshotsReady, user?.uid]);

  const approveRequest = useCallback(async (request: ConnectionRequest) => {
    if (!user || request.ownerUid !== user.uid) throw Error('Only the code owner can approve this request.');
    setLoading(true); setError('');
    try {
      const ownerIdentity = await loadIdentity();
      if (request.kind === 'family' && ownerIdentity.details.accountType !== 'adult') throw Error('Minor accounts cannot approve Family requests or manage another account.');
      const connectionId = connectionPairId(request.kind, request.ownerUid, request.requesterUid);
      if (connections.some(item => item.kind === request.kind && connectionPairId(item.kind, item.ownerUid, item.memberUid) === connectionId)) throw Error(`This person is already in your ${request.kind === 'family' ? 'family' : 'friends'}.`);
      const batch = writeBatch(db);
      batch.update(doc(db, 'connectionRequests', request.id), { status: 'approved', updatedAt: serverTimestamp() });
      batch.set(doc(db, 'connections', connectionId), {
        requestId: request.id,
        kind: request.kind, ownerUid: request.ownerUid, ownerName: request.ownerName, ownerAvatarId: request.ownerAvatarId ?? defaultAvatarId(request.ownerUid), ownerAccountType: ownerIdentity.details.accountType, memberUid: request.requesterUid, memberName: request.requesterName, memberAvatarId: request.requesterAvatarId ?? defaultAvatarId(request.requesterUid),
        memberAccountType: request.requesterAccountType, ownerShareScore: false, ownerShareLocation: false, memberShareScore: request.kind === 'family' && request.requesterAccountType === 'minor', memberShareLocation: false,
        ownerScore: null, memberScore: request.kind === 'family' && request.requesterAccountType === 'minor' ? 100 : null, ownerScoreMeasured: false, memberScoreMeasured: false, ownerLatitude: null, ownerLongitude: null, ownerLocationAt: null, memberLatitude: null, memberLongitude: null, memberLocationAt: null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      if (request.kind === 'family') batch.set(doc(db, 'familyMemberships', request.requesterUid), { minorUid: request.requesterUid, organizerUid: request.ownerUid, connectionId, createdAt: serverTimestamp() });
      batch.update(doc(db, 'connectionCodes', request.code), { status: 'closed' });
      await batch.commit();
    } finally { setLoading(false); }
  }, [connections, loadIdentity, user?.uid]);
  const declineRequest = useCallback(async (request: ConnectionRequest) => {
    if (!user || request.ownerUid !== user.uid) throw Error('Only the code owner can decline this request.');
    setLoading(true); try { await deleteDoc(doc(db, 'connectionRequests', request.id)); } finally { setLoading(false); }
  }, [user?.uid]);

  const setSharing = useCallback(async (connection: CuboConnection, key: ShareKey, enabled: boolean) => {
    if (!user) throw Error('Sign in to update sharing.');
    const owner = connection.ownerUid === user.uid;
    if (!owner && connection.memberUid !== user.uid) throw Error('This connection does not belong to you.');
    if (key === 'score' && !enabled && connection.kind === 'family' && connection.memberUid === user.uid && connection.memberAccountType === 'minor') throw Error('Your safety score is required for your linked family organizer.');
    setLoading(true); setError('');
    try {
      const prefix = owner ? 'owner' : 'member';
      const update: Record<string, unknown> = { [`${prefix}Share${key === 'score' ? 'Score' : 'Location'}`]: enabled, updatedAt: serverTimestamp() };
      if (!owner && connection.kind === 'family' && connection.memberAccountType === 'minor') {
        update.memberShareScore = true;
        update.memberScore = averageScore(sessions);
        update.memberScoreMeasured = sessions.some(item => item.attentionMeasured);
      }
      if (key === 'score') {
        update[`${prefix}Score`] = enabled ? averageScore(sessions) : null;
        update[`${prefix}ScoreMeasured`] = enabled && sessions.some(item => item.attentionMeasured);
      }
      if (key === 'location') {
        if (enabled) {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status !== 'granted') throw Error('Allow location access in Account before sharing your location.');
          const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          update[`${prefix}Latitude`] = point.coords.latitude;
          update[`${prefix}Longitude`] = point.coords.longitude;
          update[`${prefix}LocationAt`] = serverTimestamp();
        } else {
          update[`${prefix}Latitude`] = null; update[`${prefix}Longitude`] = null; update[`${prefix}LocationAt`] = null;
        }
      }
      await updateDoc(doc(db, 'connections', connection.id), update);
    } finally { setLoading(false); }
  }, [sessions, user?.uid]);
  const removeConnection = useCallback(async (connection: CuboConnection) => {
    if (!user || (connection.ownerUid !== user.uid && connection.memberUid !== user.uid)) throw Error('This connection does not belong to you.');
    const requestId = connection.requestId ?? connection.id;
    const requestRef = doc(db, 'connectionRequests', requestId);
    const requestExists = [...rawIncoming, ...rawOutgoing].some(request => request.id === requestId);
    const familyPolicyRef = connection.kind === 'family' && connection.memberAccountType === 'minor'
      ? doc(db, 'familyAppPolicies', connection.memberUid)
      : null;
    const familyPolicyExists = familyPolicyRef ? (await getDoc(familyPolicyRef)).exists() : false;
    const familyMembershipRef = connection.kind === 'family' ? doc(db, 'familyMemberships', connection.memberUid) : null;
    const familyMembershipExists = familyMembershipRef ? (await getDoc(familyMembershipRef)).exists() : false;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'connections', connection.id));
    if (familyMembershipRef && familyMembershipExists) batch.delete(familyMembershipRef);
    if (familyPolicyRef && familyPolicyExists) batch.delete(familyPolicyRef);
    if (locationShareRequests.some(item => item.connectionId === connection.id)) batch.delete(doc(db, 'locationShareRequests', connection.id));
    if (birthDateRequests.some(item => item.connectionId === connection.id)) batch.delete(doc(db, 'birthDateChangeRequests', connection.memberUid));
    if (requestExists) batch.delete(requestRef);
    await batch.commit();
  }, [birthDateRequests, locationShareRequests, rawIncoming, rawOutgoing, user?.uid]);

  const requestLocationShare = useCallback(async (connection: CuboConnection) => {
    if (!user || accountDetails?.accountType !== 'adult' || connection.kind !== 'family' || connection.ownerUid !== user.uid || connection.memberAccountType !== 'minor') throw Error('Only an adult family organizer can request this minor’s location snapshot.');
    const previous = locationShareRequests.find(item => item.connectionId === connection.id);
    if (previous?.status === 'pending') throw Error(`${connection.memberName} already has a location request waiting.`);
    const reference = doc(db, 'locationShareRequests', connection.id);
    if (previous) await updateDoc(reference, { status: 'pending', updatedAt: serverTimestamp() });
    else await setDoc(reference, {
      connectionId: connection.id,
      organizerUid: connection.ownerUid,
      organizerName: connection.ownerName,
      minorUid: connection.memberUid,
      minorName: connection.memberName,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, [accountDetails?.accountType, locationShareRequests, user?.uid]);

  const respondLocationShare = useCallback(async (request: LocationShareRequest, approved: boolean) => {
    if (!user || request.minorUid !== user.uid || request.status !== 'pending') throw Error('This location request is no longer waiting for you.');
    const familyConnection = connections.find(item => item.id === request.connectionId && item.kind === 'family' && item.memberUid === user.uid);
    if (!familyConnection) throw Error('This family connection is no longer available.');
    if (approved) await setSharing(familyConnection, 'location', true);
    await updateDoc(doc(db, 'locationShareRequests', request.id), { status: approved ? 'approved' : 'denied', updatedAt: serverTimestamp() });
  }, [connections, setSharing, user?.uid]);

  const requestBirthDateChange = useCallback(async (details: AccountDetails) => {
    if (!user || !accountDetails) throw Error('Sign in before changing your birth date.');
    const familyConnection = connections.find(item => item.kind === 'family' && item.memberUid === user.uid);
    if (!familyConnection) throw Error('No parent or organizer is linked to approve this change.');
    if (details.accountType === 'minor' && connections.some(item => item.kind === 'family' && item.ownerUid === user.uid)) throw Error('Remove the Family connections you organize before changing this account to a minor. A minor cannot keep parent controls over another account.');
    const membershipRef = doc(db, 'familyMemberships', user.uid);
    if (!(await getDoc(membershipRef)).exists()) {
      await setDoc(membershipRef, {
        minorUid: user.uid,
        organizerUid: familyConnection.ownerUid,
        connectionId: familyConnection.id,
        createdAt: serverTimestamp(),
      });
    }
    const pending = birthDateRequests.find(item => item.minorUid === user.uid && item.status === 'pending');
    if (pending) {
      await updateDoc(doc(db, 'birthDateChangeRequests', user.uid), { requestedBirthDate: details.birthDate, requestedAccountType: details.accountType, updatedAt: serverTimestamp() });
      return;
    }
    await setDoc(doc(db, 'birthDateChangeRequests', user.uid), {
      connectionId: familyConnection.id,
      organizerUid: familyConnection.ownerUid,
      organizerName: familyConnection.ownerName,
      minorUid: user.uid,
      minorName: familyConnection.memberName,
      previousBirthDate: accountDetails.birthDate,
      requestedBirthDate: details.birthDate,
      requestedAccountType: details.accountType,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, [accountDetails, birthDateRequests, connections, user?.uid]);

  const reviewBirthDateChange = useCallback(async (request: BirthDateChangeRequest, approved: boolean) => {
    if (!user || accountDetails?.accountType !== 'adult' || request.organizerUid !== user.uid) throw Error('Only an adult family organizer can review the change.');
    const stalePolicy = approved && request.requestedAccountType === 'adult' ? await getDoc(doc(db, 'familyAppPolicies', request.minorUid)) : null;
    const batch = writeBatch(db);
    batch.update(doc(db, 'birthDateChangeRequests', request.id), { status: approved ? 'approved' : 'denied', updatedAt: serverTimestamp() });
    if (approved) {
      batch.update(doc(db, 'users', request.minorUid), {
        'accountDetails.birthDate': request.requestedBirthDate,
        'accountDetails.accountType': request.requestedAccountType,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'connections', request.connectionId), { memberAccountType: request.requestedAccountType, updatedAt: serverTimestamp() });
      if (stalePolicy?.exists()) batch.delete(stalePolicy.ref);
    }
    await batch.commit();
  }, [accountDetails?.accountType, user?.uid]);

  const reconcileOwnAccountRole = useCallback(async (nextType: AccountDetails['accountType']) => {
    if (!user) throw Error('Sign in before changing account type.');
    const ownedFamily = nextType === 'minor' ? connections.filter(item => item.kind === 'family' && item.ownerUid === user.uid) : [];
    const cleanupState = await Promise.all(ownedFamily.map(async item => ({
      policy: item.memberAccountType === 'minor' && (await getDoc(doc(db, 'familyAppPolicies', item.memberUid))).exists(),
      membership: (await getDoc(doc(db, 'familyMemberships', item.memberUid))).exists(),
    })));
    const batch = writeBatch(db);
    let writes = 0;
    const deletedRequests = new Set<string>();
    for (const [index, item] of ownedFamily.entries()) {
      batch.delete(doc(db, 'connections', item.id)); writes += 1;
      if (cleanupState[index].membership) { batch.delete(doc(db, 'familyMemberships', item.memberUid)); writes += 1; }
      if (cleanupState[index].policy) { batch.delete(doc(db, 'familyAppPolicies', item.memberUid)); writes += 1; }
      if (locationShareRequests.some(request => request.connectionId === item.id)) { batch.delete(doc(db, 'locationShareRequests', item.id)); writes += 1; }
      if (birthDateRequests.some(request => request.connectionId === item.id)) { batch.delete(doc(db, 'birthDateChangeRequests', item.memberUid)); writes += 1; }
      const requestId = item.requestId ?? item.id;
      if ([...rawIncoming, ...rawOutgoing].some(request => request.id === requestId)) { batch.delete(doc(db, 'connectionRequests', requestId)); deletedRequests.add(requestId); writes += 1; }
    }
    for (const request of rawIncoming) {
      if (nextType !== 'minor' || request.kind !== 'family' || request.status !== 'pending' || deletedRequests.has(request.id)) continue;
      batch.delete(doc(db, 'connectionRequests', request.id)); deletedRequests.add(request.id); writes += 1;
    }
    for (const item of connections) {
      if (item.ownerUid === user.uid && !(nextType === 'minor' && item.kind === 'family')) {
        batch.update(doc(db, 'connections', item.id), { ownerAccountType: nextType, updatedAt: serverTimestamp() }); writes += 1;
      } else if (item.memberUid === user.uid && item.kind === 'friend') {
        batch.update(doc(db, 'connections', item.id), { memberAccountType: nextType, updatedAt: serverTimestamp() }); writes += 1;
      }
    }
    for (const request of rawOutgoing) {
      if (request.status !== 'pending') continue;
      batch.update(doc(db, 'connectionRequests', request.id), { requesterAccountType: nextType, updatedAt: serverTimestamp() }); writes += 1;
    }
    if (writes) await batch.commit();
    return { removedFamilyConnections: ownedFamily.length };
  }, [birthDateRequests, connections, locationShareRequests, rawIncoming, rawOutgoing, user?.uid]);

  const value = useMemo<ConnectionContextValue>(() => ({ connections, incoming, outgoing, birthDateRequests, locationShareRequests, loading, error, canGenerateFamilyCode, createCode, enterCode, approveRequest, declineRequest, setSharing, removeConnection, requestBirthDateChange, reviewBirthDateChange, requestLocationShare, respondLocationShare, reconcileOwnAccountRole }), [connections, incoming, outgoing, birthDateRequests, locationShareRequests, loading, error, canGenerateFamilyCode, createCode, enterCode, approveRequest, declineRequest, setSharing, removeConnection, requestBirthDateChange, reviewBirthDateChange, requestLocationShare, respondLocationShare, reconcileOwnAccountRole]);
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnections() {
  const value = useContext(ConnectionContext);
  if (!value) throw Error('useConnections must be used within ConnectionProvider');
  return value;
}
