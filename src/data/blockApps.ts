import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { ImageSourcePropType } from 'react-native';

export type BlockAppDef = {
  id: string;
  name: string;
  icon?: ImageSourcePropType;
  iconName?: ComponentProps<typeof Ionicons>['name'];
  iconBackground?: string;
  iconColor?: string;
};

/** Icons supplied as prototype assets — replace if branding policies change. */
export const BLOCK_APPS: BlockAppDef[] = [
  { id: 'tiktok', name: 'TikTok', icon: require('../../assets/block-apps/tiktok.png') },
  { id: 'instagram', name: 'Instagram', icon: require('../../assets/block-apps/instagram.png') },
  { id: 'facebook', name: 'Facebook', iconName: 'logo-facebook', iconBackground: '#1877F2' },
  { id: 'snapchat', name: 'Snapchat', icon: require('../../assets/block-apps/snapchat.png') },
  { id: 'messages', name: 'Messages', icon: require('../../assets/block-apps/messages.png') },
  { id: 'facetime', name: 'FaceTime', icon: require('../../assets/block-apps/facetime.png') },
  { id: 'whatsapp', name: 'WhatsApp', icon: require('../../assets/block-apps/whatsapp.png') },
  { id: 'telegram', name: 'Telegram', iconName: 'paper-plane', iconBackground: '#229ED9' },
  { id: 'youtube', name: 'YouTube', icon: require('../../assets/block-apps/youtube.png') },
  { id: 'spotify', name: 'Spotify', icon: require('../../assets/block-apps/spotify.png') },
  { id: 'uber', name: 'Uber', icon: require('../../assets/block-apps/uber.png') },
  { id: 'doordash', name: 'DoorDash', icon: require('../../assets/block-apps/doordash.png') },
];
