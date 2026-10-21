import type { AppBlockingNotice } from '../appBlocking/AppBlockingContext';
import { makeBlockingPolicy, type AppBlockingPolicy } from '../appBlocking/policy';
import type { DriveSession, RoutePoint, SafetyEvent } from '../drives/types';
import type { PlaceResult } from '../places/searchPlaces';
import type { SavedVehicle } from '../vehicles/VehicleContext';
import { utf8Bytes } from './accountSync';

export type SyncedPlaces = { home?: PlaceResult; work?: PlaceResult; recent: PlaceResult[] };
export type SyncedAppBlocking = { version: 1; policies: Record<string, AppBlockingPolicy>; notices: AppBlockingNotice[] };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 200) => typeof value === 'string' ? value.slice(0, max) : '';
const finite = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function normalizeVehicles(value: unknown): SavedVehicle[] {
  if (!Array.isArray(value)) return [];
  const vehicles = value.slice(0, 30).flatMap(item => {
    if (!record(item)) return [];
    const id = text(item.id, 120), make = text(item.make, 80), model = text(item.model, 80);
    if (!id || !make || !model) return [];
    return [{ id, nickname: text(item.nickname, 80), make, model, year: text(item.year, 8), plate: text(item.plate, 20), paint: text(item.paint, 40) || undefined, primary: Boolean(item.primary) } satisfies SavedVehicle];
  });
  const chosen = Math.max(0, vehicles.findIndex(vehicle => vehicle.primary));
  return vehicles.map((vehicle, index) => ({ ...vehicle, primary: index === chosen }));
}

export function mergeVehicles(local: SavedVehicle[], remote: SavedVehicle[]) {
  const merged = [...normalizeVehicles(remote), ...normalizeVehicles(local).filter(vehicle => !remote.some(item => item.id === vehicle.id))];
  const primary = remote.find(vehicle => vehicle.primary)?.id ?? local.find(vehicle => vehicle.primary)?.id ?? merged[0]?.id;
  return merged.slice(0, 30).map(vehicle => ({ ...vehicle, primary: vehicle.id === primary }));
}

function normalizePlace(value: unknown): PlaceResult | undefined {
  if (!record(value)) return undefined;
  const id = text(value.id, 240), title = text(value.title, 160), subtitle = text(value.subtitle, 300);
  const latitude = finite(value.latitude, NaN), longitude = finite(value.longitude, NaN);
  if (!id || !title || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  return { id, title, subtitle, latitude, longitude };
}

export function normalizePlaces(value: unknown): SyncedPlaces {
  const input = record(value) ? value : {};
  const recent = Array.isArray(input.recent) ? input.recent.flatMap(item => normalizePlace(item) ?? []).slice(0, 3) : [];
  return { home: normalizePlace(input.home), work: normalizePlace(input.work), recent };
}

export function mergePlaces(local: SyncedPlaces, remote: SyncedPlaces) {
  const left = normalizePlaces(local), right = normalizePlaces(remote);
  const recent = [...right.recent, ...left.recent].filter((place, index, all) => all.findIndex(item => item.id === place.id) === index).slice(0, 3);
  return { home: right.home ?? left.home, work: right.work ?? left.work, recent };
}

export function normalizeAppBlocking(value: unknown): SyncedAppBlocking {
  const input = record(value) ? value : {};
  const policies: Record<string, AppBlockingPolicy> = {};
  if (record(input.policies)) Object.entries(input.policies).slice(0, 50).forEach(([uid, policy]) => {
    if (record(policy)) policies[uid.slice(0, 128)] = makeBlockingPolicy(uid.slice(0, 128), text(policy.targetName, 60), policy);
  });
  const notices = Array.isArray(input.notices) ? input.notices.slice(0, 30).flatMap(item => {
    if (!record(item)) return [];
    const id = text(item.id, 160), targetUid = text(item.targetUid, 128);
    if (!id || !targetUid) return [];
    return [{ id, targetUid, targetName: text(item.targetName, 60), title: text(item.title, 100), body: text(item.body, 500), createdAt: text(item.createdAt, 40), read: Boolean(item.read) } satisfies AppBlockingNotice];
  }) : [];
  return { version: 1 as const, policies, notices };
}

export function mergeAppBlocking(local: SyncedAppBlocking, remote: SyncedAppBlocking) {
  const left = normalizeAppBlocking(local), right = normalizeAppBlocking(remote);
  const policies = { ...left.policies };
  Object.entries(right.policies).forEach(([uid, policy]) => {
    if (!policies[uid] || Date.parse(policy.updatedAt || '0') >= Date.parse(policies[uid].updatedAt || '0')) policies[uid] = policy;
  });
  const notices = [...right.notices, ...left.notices].filter((notice, index, all) => all.findIndex(item => item.id === notice.id) === index).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 30);
  return { version: 1 as const, policies, notices };
}

function sample<T>(values: T[], limit: number) {
  if (values.length <= limit) return values;
  return Array.from({ length: limit }, (_, index) => values[Math.round(index * (values.length - 1) / (limit - 1))]);
}

function normalizeRoute(value: unknown): RoutePoint[] {
  if (!Array.isArray(value)) return [];
  return sample(value.flatMap(item => {
    if (!record(item)) return [];
    const latitude = finite(item.latitude, NaN), longitude = finite(item.longitude, NaN);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    return [{ latitude, longitude, speedMph: Math.max(0, finite(item.speedMph)), recordedAt: text(item.recordedAt, 40) }];
  }), 100);
}

function normalizeEvents(value: unknown): SafetyEvent[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-50).flatMap(item => {
    if (!record(item) || !text(item.id, 160) || !text(item.type, 40)) return [];
    return [{ ...item, id: text(item.id, 160), type: text(item.type, 40), severity: text(item.severity, 20), title: text(item.title, 120), detail: text(item.detail, 500), occurredAt: text(item.occurredAt, 40), elapsedSeconds: finite(item.elapsedSeconds), speedMph: finite(item.speedMph) } as SafetyEvent];
  });
}

function normalizeTrip(value: unknown): DriveSession | undefined {
  if (!record(value)) return undefined;
  const id = text(value.id, 160), startedAt = text(value.startedAt, 40);
  if (!id || !startedAt) return undefined;
  return {
    id, driverName: text(value.driverName, 100), vehicleName: text(value.vehicleName, 160), startedAt, endedAt: text(value.endedAt, 40) || undefined,
    durationSeconds: Math.max(0, finite(value.durationSeconds)), distanceMiles: Math.max(0, finite(value.distanceMiles)), focusScore: Math.min(100, Math.max(0, finite(value.focusScore))),
    attentionMeasured: Boolean(value.attentionMeasured), measuredMs: Math.max(0, finite(value.measuredMs)), attentiveMs: Math.max(0, finite(value.attentiveMs)), interrupted: Boolean(value.interrupted),
    events: normalizeEvents(value.events), route: normalizeRoute(value.route),
  };
}

export function compactDriveSessions(value: unknown): DriveSession[] {
  if (!Array.isArray(value)) return [];
  const trips = value.flatMap(trip => normalizeTrip(trip) ?? []).sort((a, b) => Date.parse(b.endedAt ?? b.startedAt) - Date.parse(a.endedAt ?? a.startedAt)).slice(0, 50);
  while (trips.length && utf8Bytes(JSON.stringify({ version: 1, data: trips })) > 680_000) trips.pop();
  return trips;
}

export function mergeDriveSessions(local: DriveSession[], remote: DriveSession[]) {
  const byId = new Map<string, DriveSession>();
  compactDriveSessions(remote).forEach(trip => byId.set(trip.id, trip));
  local.forEach(trip => { if (trip?.id) byId.set(trip.id, trip); });
  return [...byId.values()].sort((a, b) => Date.parse(b.endedAt ?? b.startedAt) - Date.parse(a.endedAt ?? a.startedAt));
}
