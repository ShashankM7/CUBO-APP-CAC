import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

export async function copyInvitation(text: string): Promise<void> {
  if (!await Clipboard.setStringAsync(text)) throw new Error('Copy unavailable');
}

export async function shareInvitation(text: string): Promise<'opened' | 'cancelled' | 'unavailable'> {
  const result = await Share.share({ title: 'Join me on CUBO', message: text });
  return result.action === Share.dismissedAction ? 'cancelled' : 'opened';
}
