import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../features/auth/AuthContext';
import { formatBirthInput } from '../features/auth/inputFormatting';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAppearance } from '../theme/AppearanceContext';
import type { AppColors } from '../theme/colors';
import { MotionPressable } from './MotionPressable';

type Props = { visible: boolean; onClose: () => void };

export function DeleteAccountSheet({ visible, onClose }: Props) {
  const { deleteAccount } = useAuth();
  const { colors } = useAppearance();
  const reduced = useReducedMotion();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [step, setStep] = useState<'warning' | 'birthday'>('warning');
  const [birthDate, setBirthDate] = useState('');
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible) { setStep('warning'); setBirthDate(''); setMessage(''); setDeleting(false); }
  }, [visible]);

  const close = () => { if (!deleting) onClose(); };
  const remove = async () => {
    setMessage(''); setDeleting(true);
    try { await deleteAccount(birthDate); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'CUBO could not delete this account. Nothing else was changed.'); setDeleting(false); }
  };

  return <Modal transparent visible={visible} animationType={reduced ? 'none' : 'fade'} onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <Pressable accessibilityLabel="Close delete account dialog" style={StyleSheet.absoluteFill} onPress={close}><View /></Pressable>
      <View accessibilityRole="alert" style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.dangerIcon}><Ionicons name="trash-outline" size={24} color={colors.danger} /></View>
        {step === 'warning' ? <>
          <Text style={styles.title}>Delete your account?</Text>
          <Text style={styles.body}>This permanently removes your CUBO profile, saved vehicles, places, trips, preferences, Assistant history, pending requests, and Firebase sign-in.</Text>
          <View style={styles.note}><Ionicons name="people-outline" size={18} color={colors.textSecondary} /><Text style={styles.noteText}>Existing Family and Friend connections will remain visible to the other person as “Account Terminated,” with sharing turned off.</Text></View>
          <MotionPressable accessibilityRole="button" onPress={() => setStep('birthday')} style={styles.deleteButton}><Text style={styles.deleteButtonText}>Continue</Text></MotionPressable>
          <MotionPressable accessibilityRole="button" onPress={close} style={styles.cancelButton}><Text style={styles.cancelText}>Keep my account</Text></MotionPressable>
        </> : <>
          <Text style={styles.title}>Confirm your birth date</Text>
          <Text style={styles.body}>Enter the birth date saved on this account. This final check works with every sign-in method.</Text>
          <Text style={styles.label}>Birth date</Text>
          <TextInput
            autoFocus
            accessibilityLabel="Birth date confirmation"
            value={birthDate}
            onChangeText={value => { setMessage(''); setBirthDate(formatBirthInput(value, birthDate)); }}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="MM/DD/YYYY"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
          />
          {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
          <MotionPressable accessibilityRole="button" accessibilityState={{ disabled: deleting || birthDate.length !== 10 }} disabled={deleting || birthDate.length !== 10} onPress={() => void remove()} style={[styles.deleteButton, (deleting || birthDate.length !== 10) && styles.disabled]}>
            {deleting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.deleteButtonText}>Permanently delete account</Text>}
          </MotionPressable>
          <MotionPressable accessibilityRole="button" disabled={deleting} onPress={() => { setStep('warning'); setMessage(''); }} style={styles.cancelButton}><Text style={styles.cancelText}>Back</Text></MotionPressable>
        </>}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const makeStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.58)' },
  sheet: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.dangerSoft },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 999, backgroundColor: colors.border, marginBottom: 20 },
  dangerIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSoft, marginBottom: 16 },
  title: { color: colors.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 23, letterSpacing: -.5 },
  body: { color: colors.textSecondary, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 20, marginTop: 8 },
  note: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.surfaceMuted, marginTop: 18 },
  noteText: { flex: 1, color: colors.textSecondary, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
  label: { color: colors.text, fontFamily: 'Manrope_700Bold', fontSize: 12, marginTop: 20, marginBottom: 8 },
  input: { minHeight: 54, borderRadius: 15, borderWidth: 1, borderColor: colors.dangerSoft, backgroundColor: colors.background, color: colors.text, paddingHorizontal: 16, fontFamily: 'Manrope_700Bold', fontSize: 18, letterSpacing: 1.4 },
  error: { color: colors.danger, fontFamily: 'Manrope_600SemiBold', fontSize: 12, lineHeight: 18, marginTop: 10 },
  deleteButton: { minHeight: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger, marginTop: 20 },
  deleteButtonText: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 14 },
  cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  cancelText: { color: colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  disabled: { opacity: .45 },
});
