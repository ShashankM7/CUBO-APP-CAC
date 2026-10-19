import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { Image, StyleSheet, View } from 'react-native';

import type { BlockAppDef } from '../data/blockApps';

export function BlockAppIcon({ app, size, style, borderColor, borderWidth = 0 }: { app: BlockAppDef; size: number; style?: StyleProp<ViewStyle>; borderColor?: string; borderWidth?: number }) {
  const radius = Math.round(size * .3);
  if (app.icon) return <View style={[s.brand, { width: size, height: size, borderRadius: radius, borderColor, borderWidth }, style]}><Image source={app.icon} resizeMode="contain" style={s.image} /></View>;
  return <View style={[s.brand, { width: size, height: size, borderRadius: radius, backgroundColor: app.iconBackground, borderColor, borderWidth }, style]}>
    <Ionicons name={app.iconName ?? 'apps'} size={Math.round(size * .58)} color={app.iconColor ?? '#FFFFFF'} />
  </View>;
}

const s = StyleSheet.create({ brand: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, image: { width: '100%', height: '100%' } });
