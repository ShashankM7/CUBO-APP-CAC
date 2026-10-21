import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../../lib/firebase';

export const ACCOUNT_SYNC_DOMAINS = ['vehicles', 'places', 'insurance', 'blockedApps', 'drives', 'assistant'] as const;
export type AccountSyncDomain = typeof ACCOUNT_SYNC_DOMAINS[number];

const payloadLimits: Record<AccountSyncDomain, number> = {
  vehicles: 60_000,
  places: 80_000,
  insurance: 20_000,
  blockedApps: 120_000,
  drives: 700_000,
  assistant: 500_000,
};

type Envelope<T> = { version: 1; data: T };
type StoredDocument = { schemaVersion?: unknown; payload?: unknown };

export function utf8Bytes(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index++; }
    else bytes += 3;
  }
  return bytes;
}

export function encodeAccountPayload<T>(domain: AccountSyncDomain, data: T) {
  const payload = JSON.stringify({ version: 1, data } satisfies Envelope<T>);
  if (utf8Bytes(payload) > payloadLimits[domain]) throw Error(`CUBO ${domain} data is too large to sync safely.`);
  return payload;
}

export function decodeAccountPayload<T>(domain: AccountSyncDomain, value: StoredDocument) {
  if (value.schemaVersion !== 1 || typeof value.payload !== 'string' || utf8Bytes(value.payload) > payloadLimits[domain]) throw Error(`CUBO ${domain} cloud data is invalid.`);
  const parsed = JSON.parse(value.payload) as Partial<Envelope<T>>;
  if (parsed.version !== 1 || !('data' in parsed)) throw Error(`CUBO ${domain} cloud data uses an unsupported version.`);
  return parsed.data as T;
}

export function reconcileAccountValue<T>(domain: AccountSyncDomain, local: T, remote: unknown, lastSyncedPayload: string | null, normalize: (value: unknown) => T, prepare: (value: T) => unknown, merge: (local: T, remote: T) => T, mergeInitial: boolean) {
  const normalized = normalize(remote);
  const localPayload = encodeAccountPayload(domain, prepare(local));
  const deviceHasOfflineChanges = lastSyncedPayload !== null && localPayload !== lastSyncedPayload;
  const value = deviceHasOfflineChanges ? local : lastSyncedPayload === null && mergeInitial ? merge(local, normalized) : normalized;
  return { value, payload: encodeAccountPayload(domain, prepare(value)), deviceHasOfflineChanges };
}

function accountDocument(uid: string, domain: AccountSyncDomain) {
  if (!uid.trim()) throw Error('Sign in before syncing CUBO data.');
  return doc(db, 'users', uid, 'sync', domain);
}

export function observeAccountDomain<T>(uid: string, domain: AccountSyncDomain, onValue: (value: T, payload: string) => void, onMissing: () => void, onError: (error: Error) => void) {
  return onSnapshot(accountDocument(uid, domain), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.hasPendingWrites) return;
    if (!snapshot.exists()) { onMissing(); return; }
    try {
      const stored = snapshot.data() as StoredDocument;
      const value = decodeAccountPayload<T>(domain, stored);
      onValue(value, stored.payload as string);
    } catch (cause) { onError(cause instanceof Error ? cause : Error(`CUBO ${domain} cloud data could not be read.`)); }
  }, cause => onError(cause instanceof Error ? cause : Error(`CUBO ${domain} could not connect to account sync.`)));
}

export async function writeAccountDomain(uid: string, domain: AccountSyncDomain, payload: string) {
  if (utf8Bytes(payload) > payloadLimits[domain]) throw Error(`CUBO ${domain} data is too large to sync safely.`);
  await setDoc(accountDocument(uid, domain), { schemaVersion: 1, payload, updatedAt: serverTimestamp() });
}

export function accountPayloadLimit(domain: AccountSyncDomain) { return payloadLimits[domain]; }
