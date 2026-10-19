import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppHeader } from '../components/AppHeader';
import { MotionPressable } from '../components/MotionPressable';
import { ScreenShell } from '../components/ScreenShell';
import { BLOCK_APPS } from '../data/blockApps';
import { useAuth } from '../features/auth/AuthContext';
import { useAppBlocking } from '../features/appBlocking/AppBlockingContext';
import { popularBlockIds, type AppBlockingPolicy } from '../features/appBlocking/policy';
import type { RootStackParamList } from '../navigation/types';
import { useAppearance } from '../theme/AppearanceContext';
import type { AppColors } from '../theme/colors';

export function AppBlockingScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'AppBlocking'>) {
  const { colors: c } = useAppearance();
  const s = useMemo(() => styles(c), [c]);
  const { user } = useAuth();
  const { hydrated, policyFor, savePolicy } = useAppBlocking();
  const targetUid = route.params?.targetUid ?? user?.uid ?? 'signed-out';
  const targetName = route.params?.targetName ?? 'Your drive';
  const parentManaged = Boolean(route.params?.parentManaged);
  const [policy, setPolicy] = useState<AppBlockingPolicy>(() => policyFor(targetUid, targetName));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (hydrated) setPolicy(policyFor(targetUid, targetName));
  }, [hydrated, targetName, targetUid]);

  const readOnly = policy.lockedByParent && !parentManaged;
  const selected = new Set(policy.selectedIds);
  const toggleApp = (id: string) => {
    if (readOnly) return;
    setSaved(false);
    setPolicy(current => ({ ...current, selectedIds: current.selectedIds.includes(id) ? current.selectedIds.filter(value => value !== id) : [...current.selectedIds, id] }));
  };
  const setPopular = () => { if (!readOnly) { setSaved(false); setPolicy(current => ({ ...current, selectedIds: popularBlockIds })); } };
  const save = () => { savePolicy(policy, parentManaged); setSaved(true); };

  return <ScreenShell>
    <AppHeader title={parentManaged ? `${targetName}'s apps` : 'Blocked apps'} onBack={() => navigation.goBack()} />
    <View style={s.hero}>
      <View style={s.heroTop}>
        <View style={s.shield}><Ionicons name="shield-checkmark" size={25} color={c.accent} /></View>
        <View style={s.fill}><Text style={s.eyebrow}>DRIVE FOCUS</Text><Text style={s.heroTitle}>{policy.enabled ? 'Ready for each drive' : 'Set your focus list'}</Text></View>
        <Switch accessibilityLabel="Use blocked apps list during drives" value={policy.enabled} disabled={readOnly} onValueChange={enabled => { setSaved(false); setPolicy(current => ({ ...current, enabled })); }} trackColor={{ false: c.surfaceMuted, true: c.accent }} thumbColor="#FFFFFF" />
      </View>
      <Text style={s.heroBody}>{policy.selectedIds.length ? `${policy.selectedIds.length} apps selected. CUBO will show this plan when a drive begins and clear it when the drive ends.` : 'Choose the apps that should be unavailable while you are driving.'}</Text>
      <View style={s.statusRow}><Ionicons name={policy.enabled ? 'checkmark-circle' : 'pause-circle-outline'} size={17} color={policy.enabled ? c.accent : c.textSecondary} /><Text style={s.status}>{policy.enabled ? 'Enabled for future drives' : 'Currently off'}</Text></View>
    </View>

    {parentManaged ? <View style={s.parentCard}>
      <View style={s.parentIcon}><Ionicons name="people" size={20} color={c.accent} /></View>
      <View style={s.fill}><Text style={s.cardTitle}>Parent-managed controls</Text><Text style={s.cardBody}>Turn on Parent lock to make this list read-only for {targetName}. They will receive a notification preview.</Text></View>
      <Switch accessibilityLabel="Parent lock" value={policy.lockedByParent} onValueChange={lockedByParent => { setSaved(false); setPolicy(current => ({ ...current, lockedByParent })); }} trackColor={{ false: c.surfaceMuted, true: c.accent }} thumbColor="#FFFFFF" />
    </View> : readOnly ? <View style={s.parentCard}><View style={s.parentIcon}><Ionicons name="lock-closed" size={20} color={c.accent} /></View><View style={s.fill}><Text style={s.cardTitle}>Managed by your parent</Text><Text style={s.cardBody}>Your family organizer controls this drive list.</Text></View></View> : null}

    <View style={s.sectionHeader}><View><Text style={s.sectionTitle}>Choose apps</Text><Text style={s.sectionBody}>Tap an app to add or remove it.</Text></View><View style={s.quickActions}><Pressable disabled={readOnly} onPress={setPopular} style={s.quick}><Text style={s.quickText}>Social</Text></Pressable><Pressable disabled={readOnly} onPress={() => { setSaved(false); setPolicy(current => ({ ...current, selectedIds: [] })); }} style={s.quick}><Text style={s.quickText}>Clear</Text></Pressable></View></View>
    <View style={s.grid}>{BLOCK_APPS.map(app => {
      const on = selected.has(app.id);
      return <Pressable key={app.id} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: readOnly }} onPress={() => toggleApp(app.id)} style={[s.appTile, on && s.appTileOn, readOnly && s.disabled]}>
        <View><Image source={app.icon} style={s.appIcon} /><View style={[s.check, on && s.checkOn]}>{on ? <Ionicons name="checkmark" size={13} color={c.onAccent} /> : null}</View></View>
        <Text numberOfLines={1} style={s.appName}>{app.name}</Text>
      </Pressable>;
    })}</View>

    <View style={s.preview}><Ionicons name="construct-outline" size={20} color={c.amber} /><View style={s.fill}><Text style={s.cardTitle}>Phone controls come next</Text><Text style={s.cardBody}>This version saves the policy and drive flow. Actual iPhone and Android app blocking still requires their native family-control permissions.</Text></View></View>
    <MotionPressable accessibilityRole="button" onPress={save} disabled={!hydrated || readOnly} style={[s.save, (!hydrated || readOnly) && s.disabled]}><Ionicons name={saved ? 'checkmark-circle' : 'shield-checkmark-outline'} size={20} color={c.onAccent} /><Text style={s.saveText}>{saved ? 'Drive Focus saved' : parentManaged ? `Save for ${targetName}` : 'Save Drive Focus'}</Text></MotionPressable>
  </ScreenShell>;
}

const styles = (c: AppColors) => StyleSheet.create({
  fill: { flex: 1 }, hero: { backgroundColor: c.featureSurface, borderRadius: 26, padding: 20, borderWidth: 1, borderColor: c.borderStrong, gap: 14 }, heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, shield: { width: 48, height: 48, borderRadius: 17, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }, eyebrow: { color: c.accent, fontFamily: 'Manrope_800ExtraBold', fontSize: 9, letterSpacing: 1.25 }, heroTitle: { color: c.featureText, fontFamily: 'Manrope_800ExtraBold', fontSize: 18, marginTop: 3 }, heroBody: { color: c.featureMuted, fontSize: 12, lineHeight: 18 }, statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, status: { color: c.featureText, fontFamily: 'Manrope_700Bold', fontSize: 11 },
  parentCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.borderStrong, padding: 16 }, parentIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }, cardTitle: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 13 }, cardBody: { color: c.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 3 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }, sectionTitle: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 19 }, sectionBody: { color: c.textSecondary, fontSize: 11, marginTop: 3 }, quickActions: { flexDirection: 'row', gap: 6 }, quick: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.accentSoft }, quickText: { color: c.accent, fontFamily: 'Manrope_700Bold', fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, appTile: { width: '31%', minHeight: 112, backgroundColor: c.card, borderRadius: 19, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10 }, appTileOn: { borderColor: c.accent, backgroundColor: c.accentSoft }, appIcon: { width: 48, height: 48, borderRadius: 14 }, appName: { color: c.text, fontFamily: 'Manrope_700Bold', fontSize: 11, maxWidth: '100%' }, check: { position: 'absolute', right: -7, bottom: -5, width: 22, height: 22, borderRadius: 11, backgroundColor: c.card, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }, checkOn: { backgroundColor: c.accent, borderColor: c.card },
  preview: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 18, padding: 16, backgroundColor: c.amberSoft }, save: { minHeight: 54, borderRadius: 17, backgroundColor: c.accent, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, saveText: { color: c.onAccent, fontFamily: 'Manrope_800ExtraBold', fontSize: 13 }, disabled: { opacity: .48 },
});
