import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { useAppearance } from '../theme/AppearanceContext';
import type { DriveBlockPlan } from '../features/appBlocking/AppBlockingContext';

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
        Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -34, duration: 280, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) closeRef.current(); });
    }, 1700);
    return () => { clearTimeout(timer); opacity.stopAnimation(); translateY.stopAnimation(); };
  }, [plan, opacity, translateY]);

  if (!plan) return null;
  return <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[s.toast, { backgroundColor: c.card, borderColor: c.borderStrong, opacity, transform: [{ translateY }] }]}>
    <View style={[s.shield, { backgroundColor: c.accent }]}><Ionicons name="shield-checkmark" size={21} color={c.onAccent} /></View>
    <View style={s.copy}>
      <Text style={[s.eyebrow, { color: c.accent }]}>SAFETY MONITORING ACTIVE</Text>
      <Text style={[s.title, { color: c.text }]}>Selected apps blocked during drive</Text>
      <Text style={[s.body, { color: c.textSecondary }]}>{plan.apps.length} app{plan.apps.length === 1 ? '' : 's'} will return when the drive ends.</Text>
    </View>
    <View style={s.apps}>{plan.apps.slice(0, 3).map((app, index) => <Image key={app.id} source={app.icon} resizeMode="contain" style={[s.appIcon, { borderColor: c.card, marginLeft: index ? -8 : 0 }]} />)}{plan.apps.length > 3 ? <View style={[s.more, { backgroundColor: c.accentSoft, borderColor: c.card }]}><Text style={[s.moreText, { color: c.accent }]}>+{plan.apps.length - 3}</Text></View> : null}</View>
  </Animated.View>;
}

const s = StyleSheet.create({
  toast: { position: 'absolute', zIndex: 60, top: 96, left: 16, right: 16, minHeight: 84, borderRadius: 22, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#06110C', shadowOpacity: .24, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 12 },
  shield: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1 }, eyebrow: { fontFamily: 'Manrope_800ExtraBold', fontSize: 8, letterSpacing: 1.05 }, title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 12, lineHeight: 17, marginTop: 2 }, body: { fontSize: 9, lineHeight: 13, marginTop: 2 }, apps: { flexDirection: 'row', alignItems: 'center', paddingLeft: 4 }, appIcon: { width: 28, height: 28, borderRadius: 9, borderWidth: 2 }, more: { width: 28, height: 28, borderRadius: 9, borderWidth: 2, marginLeft: -8, alignItems: 'center', justifyContent: 'center' }, moreText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 8 },
});
