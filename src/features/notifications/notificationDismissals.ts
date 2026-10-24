import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@cubo/notifications/dismissed/v1';
const MAX_DISMISSED = 400;

const keyFor = (uid: string) => `${PREFIX}/${uid}`;

export async function readDismissedNotificationIds(uid: string) {
  try {
    const raw = await AsyncStorage.getItem(keyFor(uid));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set<string>(Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string').slice(-MAX_DISMISSED) : []);
  } catch {
    return new Set<string>();
  }
}

export async function saveDismissedNotificationIds(uid: string, ids: Set<string>) {
  await AsyncStorage.setItem(keyFor(uid), JSON.stringify([...ids].slice(-MAX_DISMISSED)));
}
