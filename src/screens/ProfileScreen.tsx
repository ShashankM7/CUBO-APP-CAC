import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { MotionPressable } from '../components/MotionPressable';
import { ScreenShell } from '../components/ScreenShell';
import { AppInviteSheet } from '../components/AppInviteSheet';
import { MediaAccessPreference } from '../components/MediaAccessPreference';
import { VoicePreference } from '../components/VoicePreference';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { DeleteAccountSheet } from '../components/DeleteAccountSheet';
import type { RootStackParamList } from '../navigation/types';
import { useAppearance } from '../theme/AppearanceContext';
import type { AppColors } from '../theme/colors';
import { spacing } from '../theme/theme';
import { useProfile } from '../features/profile/ProfileContext';
import { useVehicles } from '../features/vehicles/VehicleContext';
import { useAuth } from '../features/auth/AuthContext';

export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { profile } = useProfile();
  const { colors, preference, setMode } = useAppearance();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [notifications, setNotifications] = useState(true);
  const [tripReports, setTripReports] = useState(true);
  const { user, signOut, accountDetails } = useAuth();

  return <ScreenShell edgeToEdge safeAreaColor="#0B3023">
    <LinearGradient colors={['#0B3023', '#124D32']} style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 30 }}>
      <View style={[styles.header, { paddingTop: 0 }]}><View><Text style={[styles.title, { color: '#FFFFFF', fontSize: 32 }]}>Account</Text><Text style={[styles.subtitle, { color: '#C5DECD' }]}>Make CUBO yours.</Text></View><MotionPressable accessibilityLabel="Go to Home" onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })} style={[styles.homeButton, { backgroundColor: 'rgba(255,255,255,.1)', borderWidth: 0, borderRadius: 22 }]}><Ionicons name="home-outline" size={20} color="#FFFFFF" /></MotionPressable></View>
      <MotionPressable accessibilityLabel="Edit profile" onPress={() => navigation.navigate('SettingsDetail', { kind: 'edit' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 }}>
        <ProfileAvatar avatarId={profile.avatarId} photoUri={profile.photoUri} uid={user?.uid} size={64} rounded />
        <View style={styles.fill}><Text style={[styles.name, { color: '#FFFFFF', fontSize: 19 }]}>{profile.name}</Text><Text style={{ color: '#C5DECD', marginTop: 5, fontSize: 12 }}>View and edit your profile</Text></View><Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
      </MotionPressable>
    </LinearGradient>
    <View style={{ paddingHorizontal: 22, gap: 8 }}>
    {!accountDetails?.birthDate || !user?.email || !profile.name.trim() ? <View style={styles.group}><Text style={[styles.rowTitle, { paddingTop: 16 }]}>Account details not set</Text><Text style={[styles.rowDetail, { paddingBottom: 16 }]}>Add your missing birth date or name in Edit profile.</Text></View> : null}
    <Text style={styles.section}>Saved Places</Text><View style={styles.group}><SettingsRow icon="home-outline" title="Home Address" detail="Set or change your saved address" onPress={() => navigation.navigate('SavedPlace', { kind: 'home' })} colors={colors} styles={styles} /><SettingsRow icon="briefcase-outline" title="Work Address" detail="Set or change your saved address" onPress={() => navigation.navigate('SavedPlace', { kind: 'work' })} colors={colors} styles={styles} last /></View>
    <Text style={styles.section}>Connections</Text>
    <View style={styles.group}>
      <SettingsRow icon="people-outline" title="Family" detail="Members, safety insights, and family controls" onPress={() => navigation.navigate('Family')} colors={colors} styles={styles} />
      <SettingsRow icon="business-outline" title="Insurance" detail="Savings preview and driver reports" onPress={() => navigation.navigate('InsuranceConnection')} colors={colors} styles={styles} last />
    </View>

    <Text style={styles.section}>Driving</Text>
    <View style={styles.group}>
      <SettingsRow icon="time-outline" title="Drive Activity" detail="Scores, events, and coaching" onPress={() => navigation.navigate('Drives')} colors={colors} styles={styles} />
      <SettingsRow icon="scan-outline" title="Camera Calibration" detail="Set your driver and cabin frame" onPress={() => navigation.navigate('CameraCalibration')} colors={colors} styles={styles} />
      <SettingsRow icon="hardware-chip-outline" title="Cubo Devices" detail="CUBO Cruise hardware and diagnostics" onPress={() => navigation.navigate('ConnectedDevices')} colors={colors} styles={styles} />
      <SettingsRow icon="ban-outline" title="Blocked Apps" detail="Choose apps to block while driving" onPress={() => navigation.navigate('AppBlocking')} colors={colors} styles={styles} />
      <SettingsRow icon="shield-checkmark-outline" title="Privacy & Safety" detail="Video stays local · account data syncs" onPress={() => navigation.navigate('SettingsDetail', { kind: 'privacy' })} colors={colors} styles={styles} />
    </View>

    <Text style={styles.section}>Preferences</Text>
    <View style={styles.group}>
      <Pressable accessibilityRole="button" accessibilityLabel="Appearance" accessibilityState={{ expanded: appearanceOpen }} onPress={() => setAppearanceOpen(value => !value)} style={styles.row}>
        <Ionicons name="contrast-outline" size={20} color={colors.textSecondary} /><Text style={[styles.rowTitle, styles.fill]}>Appearance</Text><Text style={styles.rowTitle}>{preference === 'system' ? 'System appearance' : preference === 'dark' ? 'Dark' : 'Light'}</Text><Ionicons name={appearanceOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textSecondary} />
      </Pressable>
      {appearanceOpen ? <View accessibilityRole="radiogroup" style={{ paddingVertical: 4 }}>{([{ value: 'system', label: 'System appearance' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }] as const).map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: preference === option.value }} onPress={() => { setMode(option.value); setAppearanceOpen(false); }} style={[styles.row, styles.lastRow, { paddingHorizontal: 12, minHeight: 48, borderRadius: 12, backgroundColor: preference === option.value ? colors.accentSoft : 'transparent' }]}><Text style={[styles.rowTitle, styles.fill]}>{option.label}</Text>{preference === option.value ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}</Pressable>)}</View> : null}
      <ToggleRow icon="notifications-outline" title="Safety Notifications" value={notifications} onChange={() => setNotifications((value) => !value)} colors={colors} styles={styles} />
      <ToggleRow icon="document-text-outline" title="Trip Reports" value={tripReports} onChange={() => setTripReports((value) => !value)} colors={colors} styles={styles} />
      <MediaAccessPreference />
      <VoicePreference />
    </View>

    <Text style={styles.section}>Support</Text>
    <View style={styles.group}>
      <SettingsRow icon="paper-plane-outline" title="Invite Someone" detail="Share CUBO and a quick setup guide" onPress={() => setInviteOpen(true)} colors={colors} styles={styles} />
      <SettingsRow icon="help-circle-outline" title="Help & Feedback" onPress={() => navigation.navigate('SettingsDetail', { kind: 'help' })} colors={colors} styles={styles} />
      <SettingsRow icon="information-circle-outline" title="About CUBO" detail="Our mission and team" onPress={() => navigation.navigate('SettingsDetail', { kind: 'about' })} colors={colors} styles={styles} last />
    </View>
    <View style={styles.dangerGroup}>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.dangerRow}><Ionicons name="log-out-outline" size={18} color={colors.danger} /><View style={styles.fill}><Text style={styles.dangerText}>Log Out</Text><Text style={styles.rowDetail}>{user?.email}</Text></View></Pressable>
      <View style={styles.dangerDivider} />
      <Pressable accessibilityRole="button" onPress={() => setDeleteOpen(true)} style={styles.dangerRow}><Ionicons name="trash-outline" size={18} color={colors.danger} /><View style={styles.fill}><Text style={styles.dangerText}>Delete Account</Text><Text style={styles.rowDetail}>Permanently remove your account and synced data</Text></View><Ionicons name="chevron-forward" size={17} color={colors.danger} /></Pressable>
    </View>
    {inviteOpen ? <AppInviteSheet name={profile.name} onClose={() => setInviteOpen(false)} /> : null}
    <DeleteAccountSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </View>
  </ScreenShell>;
}

type Shared = { colors: AppColors; styles: ReturnType<typeof makeStyles> };
function SettingsRow({ icon, title, detail, onPress, colors, styles, last = false }: Shared & { icon: keyof typeof Ionicons.glyphMap; title: string; detail?: string; onPress?: () => void; last?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} style={[styles.row, last && styles.lastRow]} onPress={onPress}><Ionicons name={icon} size={20} color={colors.textSecondary} /><View style={styles.fill}><Text style={styles.rowTitle}>{title}</Text>{detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}</View><Ionicons name="chevron-forward" size={17} color={colors.textTertiary} /></Pressable>;
}
function ToggleRow({ icon, title, value, onChange, colors, styles }: Shared & { icon: keyof typeof Ionicons.glyphMap; title: string; value: boolean; onChange: () => void }) {
  return <View style={styles.row}><Ionicons name={icon} size={20} color={colors.textSecondary} /><Text style={[styles.rowTitle, styles.fill]}>{title}</Text><Switch value={value} onValueChange={onChange} trackColor={{ false: colors.surfaceMuted, true: colors.accent }} thumbColor="#FFFFFF" /></View>;
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  header: { paddingTop: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, homeButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, title: { color: colors.text, fontSize: 28, fontWeight: '800', fontFamily: 'Manrope_800ExtraBold', letterSpacing: -0.8 }, subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  avatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, avatarImage: { width: '100%', height: '100%' }, avatarText: { color: colors.accent, fontWeight: '800' }, fill: { flex: 1 }, name: { color: colors.text, fontSize: 16, fontFamily: 'Manrope_700Bold', fontWeight: '700' }, meta: { color: colors.textSecondary, fontSize: 11, marginTop: 4 }, action: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  section: { color: colors.text, fontSize: 15, fontFamily: 'Manrope_700Bold', marginTop: spacing.lg, marginBottom: 4 },
  group: { borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }, row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 10 }, lastRow: { borderBottomWidth: 0 }, rowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' }, rowDetail: { color: colors.textSecondary, fontSize: 10, marginTop: 3 },
  dangerGroup: { marginTop: spacing.lg, marginBottom: spacing.md, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.dangerSoft, backgroundColor: colors.card, overflow: 'hidden' },
  dangerRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }, dangerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.dangerSoft }, dangerText: { color: colors.danger, fontFamily: 'Manrope_700Bold', fontSize: 13 },
});
