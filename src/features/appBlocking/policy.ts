import { BLOCK_APPS } from '../../data/blockApps';

export type AppBlockingPolicy = {
  targetUid: string;
  targetName: string;
  enabled: boolean;
  lockedByParent: boolean;
  selectedIds: string[];
  updatedAt: string;
};

const appIds = new Set(BLOCK_APPS.map(app => app.id));
export const popularBlockIds = ['instagram', 'tiktok', 'snapchat', 'youtube'];

export function cleanSelectedIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && appIds.has(id)))];
}

export function makeBlockingPolicy(targetUid: string, targetName: string, current?: Partial<AppBlockingPolicy>): AppBlockingPolicy {
  return {
    targetUid,
    targetName: targetName.trim().slice(0, 60) || 'Driver',
    enabled: Boolean(current?.enabled),
    lockedByParent: Boolean(current?.lockedByParent),
    selectedIds: cleanSelectedIds(current?.selectedIds),
    updatedAt: typeof current?.updatedAt === 'string' ? current.updatedAt : '',
  };
}

export function blockingSummary(policy: AppBlockingPolicy | undefined) {
  if (!policy?.enabled) return [];
  const selected = new Set(cleanSelectedIds(policy.selectedIds));
  return BLOCK_APPS.filter(app => selected.has(app.id));
}
