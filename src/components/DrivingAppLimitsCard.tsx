import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { BLOCK_APPS } from '../data/blockApps';
import { useAppBlocking } from '../features/appBlocking/AppBlockingContext';
import type { RootStackParamList } from '../navigation/types';
import { useAppearance } from '../theme/AppearanceContext';
import { MotionPressable } from './MotionPressable';
import { BlockAppIcon } from './BlockAppIcon';

export function DrivingAppLimitsCard({ targetUid, targetName, navigation, parentManaged = true }: { targetUid: string; targetName: string; navigation: NativeStackNavigationProp<RootStackParamList>; parentManaged?: boolean }) {
  const { colors: c } = useAppearance();
  const { policyFor } = useAppBlocking();
  const policy = policyFor(targetUid, targetName);
  const apps = BLOCK_APPS.filter(app => policy.selectedIds.includes(app.id));
  return <View style={[s.card, { backgroundColor: c.card, borderColor: c.borderStrong }]}>
    <View style={[s.icon, { backgroundColor: c.accentSoft }]}><Ionicons name="shield-checkmark" size={23} color={c.accent} /></View>
    <View style={s.fill}>
      <Text style={[s.title, { color: c.text }]}>Driving app limits</Text>
      <Text style={[s.body, { color: c.textSecondary }]}>{policy.enabled ? `${apps.length} apps selected${policy.lockedByParent ? ' · Child Lock on' : ''}` : 'No blocked apps list enabled'}</Text>
      {apps.length ? <View style={s.icons}>{apps.slice(0, 5).map(app => <BlockAppIcon key={app.id} app={app} size={25} borderColor={c.card} borderWidth={2} style={{ marginRight: -5 }} />)}{apps.length > 5 ? <Text style={[s.more, { color: c.textSecondary }]}>+{apps.length - 5}</Text> : null}</View> : null}
    </View>
    <MotionPressable accessibilityLabel={`Manage driving app limits for ${targetName}`} onPress={() => navigation.navigate('AppBlocking', { targetUid, targetName, parentManaged })} style={[s.manage, { backgroundColor: c.accentSoft }]}><Text style={[s.manageText, { color: c.accent }]}>Manage</Text></MotionPressable>
  </View>;
}

const s = StyleSheet.create({ card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 21, padding: 15, borderWidth: 1 }, fill: { flex: 1 }, icon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14 }, body: { fontSize: 10, lineHeight: 15, marginTop: 3 }, icons: { flexDirection: 'row', alignItems: 'center', marginTop: 9 }, more: { fontSize: 10, marginLeft: 9 }, manage: { minHeight: 40, paddingHorizontal: 12, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, manageText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11 } });
