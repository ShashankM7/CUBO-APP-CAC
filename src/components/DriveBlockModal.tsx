import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useAppearance } from '../theme/AppearanceContext';
import type { DriveBlockPlan } from '../features/appBlocking/AppBlockingContext';
import { BlockAppIcon } from './BlockAppIcon';

export function DriveBlockModal({ plan, onClose }: { plan: DriveBlockPlan | null; onClose: () => void }) {
  const { colors: c } = useAppearance();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-28)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!plan) return;
    opacity.setValue(0);
    translateY.setValue(-28);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 220, mass: .8, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -40, duration: 300, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) closeRef.current(); });
    }, 2700);
    return () => { clearTimeout(timer); opacity.stopAnimation(); translateY.stopAnimation(); };
  }, [plan, opacity, translateY]);

  if (!plan) return null;
  return <View pointerEvents="none" style={s.overlay}>
    <Animated.View accessibilityLiveRegion="polite" style={[s.toast, { backgroundColor: c.card, borderColor: c.borderStrong, opacity, transform: [{ translateY }] }]}>
      <View style={[s.shield, { backgroundColor: c.accent }]}><Ionicons name="shield-checkmark" size={29} color={c.onAccent} /></View>
      <Text style={[s.eyebrow, { color: c.accent }]}>SAFETY MONITORING ACTIVE</Text>
      <Text style={[s.title, { color: c.text }]}>Selected apps blocked during drive</Text>
      <Text style={[s.body, { color: c.textSecondary }]}>{plan.apps.length} app{plan.apps.length === 1 ? '' : 's'} will return when the drive ends.</Text>
      <View style={s.apps}>{plan.apps.slice(0, 5).map((app, index) => <BlockAppIcon key={app.id} app={app} size={34} borderColor={c.card} borderWidth={2} style={{ marginLeft: index ? -7 : 0 }} />)}{plan.apps.length > 5 ? <View style={[s.more, { backgroundColor: c.accentSoft, borderColor: c.card }]}><Text style={[s.moreText, { color: c.accent }]}>+{plan.apps.length - 5}</Text></View> : null}</View>
    </Animated.View>
  </View>;
}

const s = StyleSheet.create({
  overlay: { position: 'absolute', zIndex: 60, top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  toast: { width: '100%', maxWidth: 340, minHeight: 180, borderRadius: 28, borderWidth: 1, paddingHorizontal: 22, paddingVertical: 20, alignItems: 'center', shadowColor: '#06110C', shadowOpacity: .28, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 14 },
  shield: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, eyebrow: { fontFamily: 'Manrope_800ExtraBold', fontSize: 9, letterSpacing: 1.25 }, title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, lineHeight: 22, textAlign: 'center', marginTop: 5 }, body: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5 }, apps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14 }, more: { width: 34, height: 34, borderRadius: 10, borderWidth: 2, marginLeft: -7, alignItems: 'center', justifyContent: 'center' }, moreText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 9 },
});
