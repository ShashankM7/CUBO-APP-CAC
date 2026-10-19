import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppearance } from '../theme/AppearanceContext';
import type { DriveBlockPlan } from '../features/appBlocking/AppBlockingContext';

export function DriveBlockModal({ plan, onClose }: { plan: DriveBlockPlan | null; onClose: () => void }) {
  const { colors: c } = useAppearance();
  if (!plan) return null;
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <View style={s.scrim}><View accessibilityViewIsModal style={[s.card, { backgroundColor: c.card, borderColor: c.borderStrong }]}>
      <View style={[s.icon, { backgroundColor: c.accentSoft }]}><Ionicons name="shield-checkmark" size={25} color={c.accent} /></View>
      <Text style={[s.eyebrow, { color: c.accent }]}>DRIVE FOCUS</Text><Text style={[s.title, { color: c.text }]}>Block plan active</Text>
      <Text style={[s.body, { color: c.textSecondary }]}>These apps are selected for this drive. They return to normal when the drive ends.</Text>
      <View style={s.apps}>{plan.apps.slice(0, 6).map(app => <View key={app.id} style={s.app}><Image source={app.icon} style={s.appIcon} /><Text numberOfLines={1} style={[s.appName, { color: c.text }]}>{app.name}</Text></View>)}</View>
      {plan.apps.length > 6 ? <Text style={[s.more, { color: c.textSecondary }]}>+{plan.apps.length - 6} more</Text> : null}
      <View style={[s.preview, { backgroundColor: c.amberSoft }]}><Ionicons name="construct-outline" size={16} color={c.amber} /><Text style={[s.previewText, { color: c.textSecondary }]}>Preview only — actual phone-level blocking is not connected yet.</Text></View>
      <Pressable accessibilityRole="button" onPress={onClose} style={[s.button, { backgroundColor: c.accent }]}><Text style={[s.buttonText, { color: c.onAccent }]}>Continue drive</Text></Pressable>
    </View></View>
  </Modal>;
}
const s = StyleSheet.create({ scrim: { flex: 1, backgroundColor: 'rgba(5,15,11,.62)', alignItems: 'center', justifyContent: 'center', padding: 24 }, card: { width: '100%', maxWidth: 380, borderRadius: 28, borderWidth: 1, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: .22, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } }, icon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 1.4 }, title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 24, marginTop: 4 }, body: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 }, apps: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 20 }, app: { width: 62, alignItems: 'center', gap: 6 }, appIcon: { width: 42, height: 42, borderRadius: 12 }, appName: { fontSize: 9, textAlign: 'center', width: 62 }, more: { marginTop: 10, fontSize: 11 }, preview: { width: '100%', borderRadius: 14, padding: 12, flexDirection: 'row', gap: 9, marginTop: 20, alignItems: 'center' }, previewText: { flex: 1, fontSize: 10, lineHeight: 15 }, button: { minHeight: 50, width: '100%', borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, buttonText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13 } });
