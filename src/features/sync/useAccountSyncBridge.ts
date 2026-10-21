import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { encodeAccountPayload, observeAccountDomain, reconcileAccountValue, writeAccountDomain, type AccountSyncDomain } from './accountSync';

type Options<T> = {
  uid?: string;
  domain: AccountSyncDomain;
  ready: boolean;
  value: T;
  normalize: (value: unknown) => T;
  prepare?: (value: T) => unknown;
  merge: (local: T, remote: T) => T;
  mergeInitial?: boolean;
  onRemote: (value: T) => void;
  delayMs?: number;
};

export function useAccountSyncBridge<T>(options: Options<T>) {
  const { uid, domain, ready, value, delayMs = 700 } = options;
  const valueRef = useRef(value); valueRef.current = value;
  const normalizeRef = useRef(options.normalize); normalizeRef.current = options.normalize;
  const prepareRef = useRef(options.prepare ?? options.normalize); prepareRef.current = options.prepare ?? options.normalize;
  const mergeRef = useRef(options.merge); mergeRef.current = options.merge;
  const mergeInitialRef = useRef(Boolean(options.mergeInitial)); mergeInitialRef.current = Boolean(options.mergeInitial);
  const onRemoteRef = useRef(options.onRemote); onRemoteRef.current = options.onRemote;
  const readyRef = useRef(ready); readyRef.current = ready;
  const cloudReady = useRef(false);
  const lastCloudPayload = useRef<string | null>(null);
  const lastSyncedPayload = useRef<string | null>(null);
  const pendingRemotePayload = useRef<string | null>(null);
  const queuedRemote = useRef<{ value: T; payload: string } | null>(null);
  const queuedMissing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const markerKey = uid ? `cubo-account-sync:v1:${uid}:${domain}` : '';
  const rememberSyncedPayload = (payload: string) => {
    lastSyncedPayload.current = payload;
    if (markerKey) void AsyncStorage.setItem(markerKey, payload).catch(() => undefined);
  };
  const applyRemote = useRef<(remote: T, payload: string) => void>(() => undefined);
  applyRemote.current = (remote, remotePayload) => {
    try {
      const resolved = reconcileAccountValue(domain, valueRef.current, remote, lastSyncedPayload.current, normalizeRef.current, prepareRef.current, mergeRef.current, mergeInitialRef.current);
      pendingRemotePayload.current = resolved.payload;
      lastCloudPayload.current = remotePayload;
      cloudReady.current = true;
      if (!resolved.deviceHasOfflineChanges) onRemoteRef.current(resolved.value);
      if (resolved.payload === remotePayload) rememberSyncedPayload(remotePayload);
      setError(''); setRevision(value => value + 1);
    } catch (cause) {
      cloudReady.current = false;
      setError(cause instanceof Error ? cause.message : `CUBO ${domain} account sync could not be read.`);
    }
  };

  useEffect(() => {
    generation.current++; const current = generation.current;
    cloudReady.current = false; lastCloudPayload.current = null; lastSyncedPayload.current = null; pendingRemotePayload.current = null; queuedRemote.current = null; queuedMissing.current = false; setError('');
    if (timer.current) clearTimeout(timer.current);
    if (!uid) return;
    let cancelled = false; let unsubscribe: (() => void) | undefined;
    void AsyncStorage.getItem(markerKey).catch(() => null).then(marker => {
      if (cancelled || generation.current !== current) return;
      lastSyncedPayload.current = marker;
      unsubscribe = observeAccountDomain<T>(uid, domain, (remote, remotePayload) => {
        if (generation.current !== current) return;
        if (!readyRef.current) { queuedRemote.current = { value: remote, payload: remotePayload }; queuedMissing.current = false; setRevision(value => value + 1); return; }
        applyRemote.current(remote, remotePayload);
      }, () => {
        if (generation.current !== current) return;
        if (!readyRef.current) { queuedRemote.current = null; queuedMissing.current = true; setRevision(value => value + 1); return; }
        cloudReady.current = true; lastCloudPayload.current = null; pendingRemotePayload.current = null;
        setError(''); setRevision(value => value + 1);
      }, cause => {
        if (generation.current !== current) return;
        cloudReady.current = false;
        setError(`Saved locally. Account sync will retry next time CUBO opens. ${cause.message}`);
      });
    });
    return () => { cancelled = true; unsubscribe?.(); };
  }, [uid, domain]);

  useEffect(() => {
    if (!uid || !ready) return;
    if (queuedRemote.current) {
      const queued = queuedRemote.current; queuedRemote.current = null; queuedMissing.current = false;
      applyRemote.current(queued.value, queued.payload);
    } else if (queuedMissing.current) {
      queuedMissing.current = false; cloudReady.current = true; lastCloudPayload.current = null; pendingRemotePayload.current = null;
      setError(''); setRevision(value => value + 1);
    }
  }, [uid, domain, ready, revision]);

  useEffect(() => {
    if (!uid || !ready || !cloudReady.current) return;
    let payload: string;
    try { payload = encodeAccountPayload(domain, (options.prepare ?? options.normalize)(value)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `CUBO ${domain} data could not be prepared for sync.`); return; }
    if (pendingRemotePayload.current !== null) {
      if (payload !== pendingRemotePayload.current) return;
      pendingRemotePayload.current = null;
    }
    if (payload === lastCloudPayload.current) return;
    if (timer.current) clearTimeout(timer.current);
    const current = generation.current;
    timer.current = setTimeout(() => {
      if (generation.current !== current || !readyRef.current) return;
      lastCloudPayload.current = payload;
      void writeAccountDomain(uid, domain, payload).then(() => {
        if (generation.current === current) { rememberSyncedPayload(payload); setError(''); }
      }).catch(cause => {
        if (generation.current !== current) return;
        lastCloudPayload.current = null;
        setError(`Saved locally. Account sync will retry next time CUBO opens. ${cause instanceof Error ? cause.message : 'Cloud write failed.'}`);
      });
    }, delayMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [uid, domain, ready, value, revision, delayMs, options.normalize, options.prepare]);

  return error;
}
