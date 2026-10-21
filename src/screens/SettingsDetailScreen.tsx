import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState, useCallback } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AccountEditor } from '../components/AccountEditor';
import { FeedbackForm } from '../components/FeedbackForm';
import { AboutCubo } from '../components/AboutCubo';
import { ScreenShell } from '../components/ScreenShell';
import { ProfilePhotoButton } from '../components/ProfilePhotoButton';
import type { RootStackParamList } from '../navigation/types';
import { useAppearance } from '../theme/AppearanceContext';
import type { AppColors } from '../theme/colors';
import { spacing } from '../theme/theme';
import { useProfile } from '../features/profile/ProfileContext';
type Props = NativeStackScreenProps<RootStackParamList, 'SettingsDetail'>;
const content = {
  edit: ['Edit profile', 'Manage your profile, account details, and sign-in security.'],
  privacy: ['Privacy and safety', 'Camera frames and raw microphone audio are processed on this device and are not stored in Firebase. Signed-in vehicles, saved places, insurance preferences, Blocked Apps settings, and bounded completed-trip records sync to your private account. Calibration, permissions, active-drive GPS, hardware pairing, map files, and profile photos remain device-specific.'],
  help: ['Help and feedback', 'Something not working? Tell us what happened, or share an idea for CUBO.'],
  about: ['About CUBO', 'Student-built driver safety for the Congressional App Challenge.'],
} as const;
export function SettingsDetailScreen({ navigation, route }: Props) {
  const { colors } = useAppearance();
  const { profile, updateName, updatePhoto } = useProfile();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const item = content[route.params.kind];
  const [name, setName] = useState(profile.name);
  const [message, setMessage] = useState('');
  useFocusEffect(useCallback(() => { setName(profile.name); setMessage(''); }, [profile.name]));
  const save = async () => { if (!name.trim()) return; try { await updateName(name); setMessage('Profile saved.'); } catch { setMessage('Could not save your name. Please try again.'); } };
  return <ScreenShell><Pressable style={styles.back} onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={20} color={colors.text} /><Text style={styles.backText}>Account</Text></Pressable><Text style={styles.title}>{item[0]}</Text><Text style={styles.body}>{item[1]}</Text>{route.params.kind === 'edit' ? <><View style={styles.photoRow}><View style={styles.avatar}>{profile.photoUri ? <Image source={{ uri: profile.photoUri }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{profile.initials}</Text>}</View><View style={styles.photoActions}><ProfilePhotoButton onPhoto={updatePhoto} />{profile.photoUri ? <Pressable onPress={() => updatePhoto(undefined)}><Text style={styles.removePhoto}>Remove photo</Text></Pressable> : null}</View></View><Text style={styles.photoNote}>Stored only on this device. JPG, PNG, or WebP up to 1.5 MB.</Text><Text style={styles.label}>Driver name</Text><TextInput accessibilityLabel="Driver name" maxLength={80} style={styles.input} value={name} onChangeText={setName} placeholder="Driver name" placeholderTextColor={colors.textTertiary} /><Pressable style={[styles.save, !name.trim() && styles.disabled]} onPress={save}><Text style={styles.saveText}>Save profile</Text></Pressable>{message ? <Text accessibilityRole="alert" style={styles.body}>{message}</Text> : null}<AccountEditor /></> : route.params.kind === 'help' ? <FeedbackForm /> : route.params.kind === 'about' ? <AboutCubo /> : <View style={styles.note}><Ionicons name="checkmark-circle-outline" size={21} color={colors.accent} /><Text style={styles.noteText}>Family sharing requires consent. Camera footage is not included in shared driving summaries.</Text></View>}</ScreenShell>;
}
const makeStyles = (c: AppColors) => StyleSheet.create({ back: { alignSelf: 'flex-start', flexDirection: 'row', gap: 7, alignItems: 'center', padding: 10, borderRadius: 13, marginTop: spacing.md, backgroundColor: c.card }, backText: { color: c.text, fontWeight: '600' }, title: { color: c.text, fontSize: 28, fontFamily: 'Manrope_800ExtraBold', fontWeight: '800', marginTop: spacing.xl }, body: { color: c.textSecondary, fontSize: 14, lineHeight: 22 }, photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: spacing.lg }, avatar: { width: 70, height: 70, borderRadius: 23, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, avatarImage: { width: '100%', height: '100%' }, avatarText: { color: c.accent, fontFamily: 'Manrope_800ExtraBold', fontSize: 18 }, photoActions: { flex: 1, gap: 8 }, removePhoto: { color: c.danger, textAlign: 'center', fontSize: 11, fontFamily: 'Manrope_700Bold' }, photoNote: { color: c.textTertiary, fontSize: 10, lineHeight: 15, marginTop: 8 }, label: { color: c.text, fontSize: 12, fontWeight: '700', marginTop: spacing.lg }, input: { color: c.text, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, minHeight: 50, paddingHorizontal: 13, fontSize: 15 }, save: { minHeight: 52, borderRadius: 16, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md }, disabled: { opacity: .35 }, saveText: { color: c.onAccent, fontWeight: '800', fontSize: 14 }, note: { flexDirection: 'row', gap: 10, padding: spacing.lg, borderRadius: 18, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, marginTop: spacing.lg }, noteText: { color: c.text, fontSize: 12, lineHeight: 18, flex: 1 } });
