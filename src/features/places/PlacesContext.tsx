import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { latestPlaces } from './recentPlaces';
import type { PlaceResult } from './searchPlaces';
import { mergePlaces, normalizePlaces, type SyncedPlaces } from '../sync/domainData';
import { useAccountSyncBridge } from '../sync/useAccountSyncBridge';
type Places = SyncedPlaces;
type Value = Places & { remember: (place: PlaceResult) => void; save: (kind: 'home' | 'work', place: PlaceResult) => void };
const Context = createContext<Value | null>(null);
export function PlacesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [places, setPlaces] = useState<Places>({ recent: [] });
  const [hydrated, setHydrated] = useState(false);
  const [hasLocalRecord, setHasLocalRecord] = useState(false);
  useEffect(() => { let mounted = true; setHydrated(false); setHasLocalRecord(false); setPlaces({ recent: [] }); if (!user) return; AsyncStorage.getItem(`cubo-places:${user.uid}`).then((raw) => { if (mounted) { if (raw) { const parsed = JSON.parse(raw); setPlaces({ ...parsed, recent: latestPlaces(parsed.recent) }); setHasLocalRecord(true); } setHydrated(true); } }).catch(() => { if (mounted) setHydrated(true); }); return () => { mounted = false; }; }, [user?.uid]);
  useEffect(() => { if (hydrated && user) void AsyncStorage.setItem(`cubo-places:${user.uid}`, JSON.stringify(places)); }, [places, hydrated, user?.uid]);
  useAccountSyncBridge({ uid: user?.uid, domain: 'places', ready: hydrated, value: places, normalize: normalizePlaces, merge: mergePlaces, mergeInitial: hasLocalRecord, onRemote: setPlaces });
  const remember = (place: PlaceResult) => setPlaces((current) => ({ ...current, recent: latestPlaces([place, ...current.recent]) }));
  const save = (kind: 'home' | 'work', place: PlaceResult) => setPlaces((current) => ({ ...current, [kind]: place }));
  return <Context.Provider value={{ ...places, remember, save }}>{children}</Context.Provider>;
}
export function usePlaces() { const value = useContext(Context); if (!value) throw Error('PlacesProvider missing'); return value; }
