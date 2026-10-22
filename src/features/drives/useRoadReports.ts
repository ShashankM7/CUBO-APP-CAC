import { collection, doc, limit, orderBy, Timestamp, runTransaction, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { db } from '../../lib/firebase';
import { REPORT_LIFETIME_MS, REPORT_RESPONSE_LIMIT, isLiveRoadReport, canConfirmRoadReport } from './roadReportPolicy';
import type { RoadHazardKind } from './types';

export type RoadReport = { id: string; reporterId: string; kind: RoadHazardKind; latitude: number; longitude: number; createdAtMs: number; confirmationCount?: number; active?: boolean; localOnly?: boolean };
type Point = { latitude: number; longitude: number };
export function reportCell(point: Point) { return `${Math.floor(point.latitude * 100)}:${Math.floor(point.longitude * 100)}`; }

export function useRoadReports(point: Point | null, enabled: boolean) {
  const { user } = useAuth();
  const [remote, setRemote] = useState<RoadReport[]>([]);
  const [local, setLocal] = useState<RoadReport[]>([]);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setRemote([]); setLocal([]); setConfirmed(new Set()); setError(''); }, [user?.uid]);
  useEffect(() => { if (!enabled) return; const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer); }, [enabled]);
  const cell = point ? reportCell(point) : '';
  useEffect(() => {
    if (!user || !enabled || !cell) { setRemote([]); return; }
    const [lat, lon] = cell.split(':').map(Number);
    const cells = [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((x) => `${lat + y}:${lon + x}`));
    const cutoff = Date.now() - REPORT_LIFETIME_MS;
    return onSnapshot(query(collection(db, 'roadReports'), where('cell', 'in', cells), where('createdAt', '>', Timestamp.fromMillis(cutoff)), orderBy('createdAt', 'desc'), limit(100)), (snapshot) => {
      setRemote(snapshot.docs.flatMap((item) => {
        const data = item.data();
        const createdAtMs = data.createdAt?.toMillis?.();
        if (!createdAtMs || Date.now() - createdAtMs > REPORT_LIFETIME_MS || !['object', 'police', 'crash'].includes(data.kind) || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) return [];
        return [{ id: item.id, reporterId: data.reporterId, kind: data.kind, latitude: data.latitude, longitude: data.longitude, createdAtMs, confirmationCount: data.confirmationCount ?? 0, active: data.active !== false } as RoadReport];
      })); setError('');
    }, () => { setError('Community reports unavailable. Your reports are saved to this trip.'); });
  }, [user?.uid, enabled, cell]);

  const submit = async (kind: RoadHazardKind, location: Point) => {
    if (!user) return;
    const coordinates = { latitude: location.latitude, longitude: location.longitude };
    const ref = doc(collection(db, 'roadReports'));
    const report: RoadReport = { id: ref.id, reporterId: user.uid, kind, ...coordinates, createdAtMs: Date.now(), localOnly: true };
    setLocal((current) => [...current, report]);
    try {
      // A live GPS fix contains extra fields such as accuracy, heading, speed,
      // and timestamp. Persist only the public hazard schema accepted by the
      // strict Firestore rules; spreading the GPS object makes the write fail.
      await setDoc(ref, { reporterId: user.uid, kind, ...coordinates, cell: reportCell(coordinates), createdAt: serverTimestamp(), confirmationCount: 0, active: true });
      setLocal((current) => current.map((item) => item.id === ref.id ? { ...item, localOnly: false } : item));
      setError('');
    } catch { setError('Saved to your trip. Sharing is currently unavailable.'); }
  };

  const confirm = async (report: RoadReport, present: boolean) => {
    if (!user || report.reporterId === user.uid) return false;
    try {
      const reportRef = doc(db, 'roadReports', report.id), voteRef = doc(reportRef, 'confirmations', user.uid);
      await runTransaction(db, async transaction => {
        const current = await transaction.get(reportRef); const vote = await transaction.get(voteRef);
        if (vote.exists()) return;
        if (!current.exists()) throw Error('Report no longer available.');
        const data = current.data(); const count = data.confirmationCount ?? 0;
        if (!canConfirmRoadReport({ reporterId: data.reporterId, createdAtMs: data.createdAt.toMillis(), confirmationCount: count, active: data.active }, user.uid, false)) throw Error('Report no longer accepting responses.');
        transaction.set(voteRef, { voterId: user.uid, present, updatedAt: serverTimestamp() });
        transaction.update(reportRef, { confirmationCount: count + 1, active: count + 1 < REPORT_RESPONSE_LIMIT });
      });
      setConfirmed((current) => new Set([...current, report.id]));
      return true;
    } catch { setError('Confirmation could not be sent. Try again later.'); return false; }
  };
  const reports = useMemo(() => [...remote, ...local.filter((report) => !remote.some((item) => item.id === report.id))].filter((report) => isLiveRoadReport(report, Date.now())), [remote, local, now]);
  return { reports, submit, confirm, confirmed, error, userId: user?.uid };
}
