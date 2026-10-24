import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteUser, getIdTokenResult, type User } from 'firebase/auth';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type WriteBatch,
} from 'firebase/firestore';

import { db } from '../../lib/firebase';
import { parseBirthDate } from './accountDetails';

export const TERMINATED_ACCOUNT_NAME = 'Account Terminated';
const SYNC_DOMAINS = ['vehicles', 'places', 'insurance', 'blockedApps', 'drives', 'assistant'] as const;
const RECENT_SIGN_IN_MS = 4 * 60 * 1000;
const BATCH_LIMIT = 400;

type BatchOperation = (batch: WriteBatch) => void;

export function birthDateMatches(input: string, savedBirthDate: string) {
  try { return parseBirthDate(input).birthDate === savedBirthDate; }
  catch { return false; }
}

export function recentSignIn(authTime: string, now = Date.now()) {
  const signedInAt = Date.parse(authTime);
  return Number.isFinite(signedInAt) && now - signedInAt <= RECENT_SIGN_IN_MS;
}

function uniqueReferences(references: DocumentReference[]) {
  return [...new Map(references.map(reference => [reference.path, reference])).values()];
}

async function commitInChunks(operations: BatchOperation[]) {
  for (let index = 0; index < operations.length; index += BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations.slice(index, index + BATCH_LIMIT).forEach(operation => operation(batch));
    await batch.commit();
  }
}

async function clearLocalAccountData(uid: string) {
  const keys = await AsyncStorage.getAllKeys().catch(() => [] as string[]);
  const ownedKeys = keys.filter(key => key.includes(uid));
  if (ownedKeys.length) await AsyncStorage.multiRemove(ownedKeys).catch(() => undefined);
  if (typeof window !== 'undefined') {
    try {
      const localKeys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).filter((key): key is string => !!key && key.includes(uid));
      localKeys.forEach(key => window.localStorage.removeItem(key));
    } catch { /* Private browsing can block localStorage access. */ }
  }
}

export async function deleteCurrentAccount(user: User, birthDateInput: string) {
  const token = await getIdTokenResult(user, true);
  if (!recentSignIn(token.authTime)) throw Error('For security, log out and sign in again, then return here to delete your account. You will not need to enter your password in this deletion flow.');

  const userReference = doc(db, 'users', user.uid);
  const userSnapshot = await getDoc(userReference);
  const savedBirthDate = userSnapshot.data()?.accountDetails?.birthDate;
  if (typeof savedBirthDate !== 'string' || !birthDateMatches(birthDateInput, savedBirthDate)) throw Error('That birth date does not match this account. Check the date and try again.');

  // This marker makes cleanup resumable while keeping every rule scoped to the
  // authenticated account. It is removed with the private user document.
  await updateDoc(userReference, { deletionRequestedAt: serverTimestamp(), updatedAt: serverTimestamp() });

  const [
    ownedCodes, ownedRequests, sentRequests, ownedConnections, joinedConnections,
    organizedMemberships, ownMemberships, organizedBirthRequests, ownBirthRequests,
    organizedLocationRequests, ownLocationRequests, organizedPolicies, ownPolicies,
    ownReports, ownConfirmations,
  ] = await Promise.all([
    getDocs(query(collection(db, 'connectionCodes'), where('ownerUid', '==', user.uid))),
    getDocs(query(collection(db, 'connectionRequests'), where('ownerUid', '==', user.uid))),
    getDocs(query(collection(db, 'connectionRequests'), where('requesterUid', '==', user.uid))),
    getDocs(query(collection(db, 'connections'), where('ownerUid', '==', user.uid))),
    getDocs(query(collection(db, 'connections'), where('memberUid', '==', user.uid))),
    getDocs(query(collection(db, 'familyMemberships'), where('organizerUid', '==', user.uid))),
    getDocs(query(collection(db, 'familyMemberships'), where('minorUid', '==', user.uid))),
    getDocs(query(collection(db, 'birthDateChangeRequests'), where('organizerUid', '==', user.uid))),
    getDocs(query(collection(db, 'birthDateChangeRequests'), where('minorUid', '==', user.uid))),
    getDocs(query(collection(db, 'locationShareRequests'), where('organizerUid', '==', user.uid))),
    getDocs(query(collection(db, 'locationShareRequests'), where('minorUid', '==', user.uid))),
    getDocs(query(collection(db, 'familyAppPolicies'), where('organizerUid', '==', user.uid))),
    getDocs(query(collection(db, 'familyAppPolicies'), where('minorUid', '==', user.uid))),
    getDocs(query(collection(db, 'roadReports'), where('reporterId', '==', user.uid))),
    getDocs(query(collectionGroup(db, 'confirmations'), where('voterId', '==', user.uid))),
  ]);

  const operations: BatchOperation[] = [];
  uniqueReferences([...ownedConnections.docs, ...joinedConnections.docs].map(snapshot => snapshot.ref)).forEach(reference => {
    const data = [...ownedConnections.docs, ...joinedConnections.docs].find(snapshot => snapshot.ref.path === reference.path)?.data();
    if (data?.ownerUid === user.uid) operations.push(batch => batch.update(reference, {
      ownerName: TERMINATED_ACCOUNT_NAME,
      ownerShareScore: false, ownerShareLocation: false, ownerScore: null, ownerScoreMeasured: false,
      ownerLatitude: null, ownerLongitude: null, ownerLocationAt: null, updatedAt: serverTimestamp(),
    }));
    if (data?.memberUid === user.uid) operations.push(batch => batch.update(reference, {
      memberName: TERMINATED_ACCOUNT_NAME,
      memberShareScore: false, memberShareLocation: false, memberScore: null, memberScoreMeasured: false,
      memberLatitude: null, memberLongitude: null, memberLocationAt: null, updatedAt: serverTimestamp(),
    }));
  });

  const deletions = uniqueReferences([
    ...ownedCodes.docs, ...ownedRequests.docs, ...sentRequests.docs,
    ...organizedMemberships.docs, ...ownMemberships.docs,
    ...organizedBirthRequests.docs, ...ownBirthRequests.docs,
    ...organizedLocationRequests.docs, ...ownLocationRequests.docs,
    ...organizedPolicies.docs, ...ownPolicies.docs,
    ...ownReports.docs, ...ownConfirmations.docs,
  ].map(snapshot => snapshot.ref));
  deletions.forEach(reference => operations.push(batch => batch.delete(reference)));
  SYNC_DOMAINS.forEach(domain => operations.push(batch => batch.delete(doc(db, 'users', user.uid, 'sync', domain))));
  await commitInChunks(operations);

  await deleteDoc(userReference);
  await deleteUser(user);
  await clearLocalAccountData(user.uid);
}
