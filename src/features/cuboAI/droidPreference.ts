export const MAP_DROID_VISIBILITY_EVENT = 'cubo-map-droid-visibility';

export function mapDroidKey(uid: string) { return `cubo-ai:${uid}:droid-map-visible`; }

export function readMapDroidVisible(storage: Pick<Storage, 'getItem'>, uid: string) {
  return storage.getItem(mapDroidKey(uid)) === 'visible';
}

export function writeMapDroidVisible(storage: Pick<Storage, 'setItem'>, uid: string, visible: boolean) {
  storage.setItem(mapDroidKey(uid), visible ? 'visible' : 'hidden');
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(MAP_DROID_VISIBILITY_EVENT, { detail: { uid, visible } }));
}
