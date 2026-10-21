import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DriveSession, SafetyEvent } from './types';
import { elapsedSeconds } from './formatDuration';
import { eventWithLocation } from '../maps/tripMapData';
import { useVehicles } from '../vehicles/VehicleContext';
import { useAuth } from '../auth/AuthContext';
import { useFamily } from '../family/FamilyContext';
import { familyRequest } from '../family/familyApi';
import { recoverCheckpoint } from './driveCheckpoint';
import { compactDriveSessions, mergeDriveSessions } from '../sync/domainData';
import { useAccountSyncBridge } from '../sync/useAccountSyncBridge';

type DriveContextValue = {
  activeSession: DriveSession | null;
  sessions: DriveSession[];
  deleteTrip: (id: string) => void;
  clearTrips: () => void;
  startDrive: () => void;
  cameraConfirmation: number;
  confirmCamera: () => void;
  addEvent: (event: Omit<SafetyEvent, 'id' | 'occurredAt'>) => void;
  updateDrive: (values: Pick<DriveSession, 'durationSeconds' | 'focusScore' | 'distanceMiles'>) => void;
  endDrive: () => DriveSession | null;
  addRoutePoint: (latitude: number, longitude: number, speedMph: number) => void;
  recordAttention: (measuredMs: number, attentiveMs: number) => void;
  persistenceError: string | null;
  monitoringStatus: string;
  setMonitoringStatus: (status: string) => void;
};

const DriveContext = createContext<DriveContextValue | null>(null);

export function DriveProvider({ children }: { children: ReactNode }) {
  const { vehicles } = useVehicles();
  const { user } = useAuth();
  const family = useFamily();
  const [shareError, setShareError] = useState<string | null>(null);
  const selected = vehicles.find(vehicle => vehicle.primary) ?? vehicles[0];
  const [cameraConfirmation, setCameraConfirmation] = useState(0);
  const confirmCamera = useCallback(() => setCameraConfirmation(value => value + 1), []);
  const [activeSession, setActiveSession] = useState<DriveSession | null>(null);
  const [sessions, setSessions] = useState<DriveSession[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [hasLocalRecord, setHasLocalRecord] = useState(false);
  const [owner, setOwner] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [monitoringStatus, setMonitoringStatus] = useState('Monitoring not started');
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    let mounted = true; setHydrated(false); setHasLocalRecord(false); setOwner(null); setSessions([]); setActiveSession(null); setCameraConfirmation(0); setPersistenceError(null);
    if (!user) return;
    const restore = async () => {
      const checkpoint = await AsyncStorage.getItem(`cubo-drive-checkpoint:${user.uid}`);
      if (checkpoint) {
        const recovered = recoverCheckpoint(JSON.parse(checkpoint));
        if (mounted) { setSessions(recovered); setHasLocalRecord(true); setOwner(user.uid); setHydrated(true); }
        return;
      }
      let saved = await AsyncStorage.getItem(`cubo-drive-sessions:${user.uid}`);
      // Claim legacy browser-only history once, preserving it without sharing it across accounts.
      if (!saved && Platform.OS === 'web' && typeof window !== 'undefined') {
        const owner = window.localStorage.getItem('cubo-legacy-history-owner');
        if (!owner || owner === user.uid) {
          saved = window.localStorage.getItem('cubo-drive-sessions');
          if (saved) window.localStorage.setItem('cubo-legacy-history-owner', user.uid);
        }
      }
      if (mounted) { if (saved) { setSessions((JSON.parse(saved) as DriveSession[]).map(session => ({ ...session, route: session.route ?? [] }))); setHasLocalRecord(true); } setOwner(user.uid); setHydrated(true); }
    };
    void restore().catch(() => { if (mounted) setPersistenceError('Drive history could not be restored. Restart the app before starting another trip.'); });
    return () => { mounted = false; };
  }, [user?.uid]);
  useEffect(() => {
    if (!hydrated || !user || owner !== user.uid) return;
    let current = true;
    const key = `cubo-drive-checkpoint:${user.uid}`;
    const value = JSON.stringify({ version: 1, sessions, active: activeSession, savedAt: new Date().toISOString() });
    // One atomic envelope and ordered writes prevent an older active checkpoint
    // from resurrecting a finished/deleted trip after a restart.
    writes.current = writes.current.catch(() => undefined).then(() => AsyncStorage.setItem(key, value)).then(() => { if (current) setPersistenceError(null); }, () => { if (current) setPersistenceError('Trip recovery could not be saved. Check available device storage.'); });
    return () => { current = false; };
  }, [sessions, activeSession, hydrated, owner, user?.uid]);
  useAccountSyncBridge({ uid: user?.uid, domain: 'drives', ready: hydrated && owner === user?.uid, value: sessions, normalize: compactDriveSessions, prepare: compactDriveSessions, merge: mergeDriveSessions, mergeInitial: hasLocalRecord, onRemote: setSessions, delayMs: 1200 });
  useEffect(() => {
    if (!hydrated || !family.configured || !family.organizerUid || !user) return;
    let active = true;
    const drives = sessions.slice(0, 50).map(session => ({ id: session.id, endedAt: session.endedAt ?? session.startedAt, vehicleName: session.vehicleName, durationSeconds: session.durationSeconds, distanceMiles: session.distanceMiles, focusScore: session.attentionMeasured ? session.focusScore : null, alertCount: session.events.length }));
    void familyRequest('/family/drives', { drives }).then(() => { if (active) setShareError(null); }).catch(error => { if (active) setShareError(error.message); });
    return () => { active = false; };
  }, [sessions, hydrated, family.configured, family.organizerUid, user?.uid]);

  const startDrive = useCallback(() => { if (!hydrated || owner !== user?.uid) return; setActiveSession((current) => current ?? ({
      id: `trip-${Date.now()}`,
      driverName: user?.displayName ?? 'Driver',
      vehicleName: selected ? `${selected.make} ${selected.model}` : 'Vehicle',
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
      distanceMiles: 0,
      focusScore: 100,
      attentionMeasured: false,
      events: [],
      route: [],
    })); }, [hydrated, owner, selected?.id, selected?.make, selected?.model, user?.uid, user?.displayName]);

  const addEvent = useCallback((event: Omit<SafetyEvent, 'id' | 'occurredAt'>) => setActiveSession((current) => current ? ({
      ...current,
      events: [...current.events, { ...eventWithLocation(event, current.route, Date.now()), id: `event-${Date.now()}-${current.events.length}`, occurredAt: new Date().toISOString() }],
    }) : current), []);

  const updateDrive = useCallback((values: Pick<DriveSession, 'durationSeconds' | 'focusScore' | 'distanceMiles'>) => {
    setActiveSession((current) => current ? ({ ...current, ...values, focusScore: current.focusScore }) : current);
  }, []);

  const recordAttention = useCallback((measuredMs: number, attentiveMs: number) => {
    setActiveSession(current => current ? { ...current, measuredMs, attentiveMs, attentionMeasured: measuredMs >= 5000, focusScore: measuredMs ? Math.round(100 * attentiveMs / measuredMs) : 0 } : current);
  }, []);

  const addRoutePoint = useCallback((latitude: number, longitude: number, speedMph: number) => setActiveSession((current) => current ? ({
    ...current,
    route: [...current.route, { latitude, longitude, speedMph, recordedAt: new Date().toISOString() }],
  }) : current), []);

  const endDrive = useCallback(() => {
      if (!activeSession) return null;
      const completed = { ...activeSession, durationSeconds: elapsedSeconds(activeSession.startedAt), endedAt: new Date().toISOString() };
      setSessions((current) => [completed, ...current]);
      setActiveSession(null);
      return completed;
    }, [activeSession]);

  const deleteTrip = useCallback((id: string) => setSessions(current => current.filter(trip => trip.id !== id)), []);
  const clearTrips = useCallback(() => setSessions([]), []);

  const value = useMemo<DriveContextValue>(() => ({
    activeSession: owner === user?.uid ? activeSession : null,
    sessions: owner === user?.uid ? sessions : [],
    recordAttention,
    persistenceError,
    monitoringStatus,
    setMonitoringStatus,
    deleteTrip,
    clearTrips,
    startDrive,
    cameraConfirmation,
    confirmCamera,
    addEvent,
    updateDrive,
    endDrive,
    addRoutePoint,
  }), [monitoringStatus, owner, user?.uid, persistenceError, recordAttention, activeSession, sessions, deleteTrip, clearTrips, startDrive, cameraConfirmation, confirmCamera, addEvent, updateDrive, endDrive, addRoutePoint]);

  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
}

export function useDrives() {
  const value = useContext(DriveContext);
  if (!value) throw new Error('useDrives must be used within DriveProvider');
  return value;
}
