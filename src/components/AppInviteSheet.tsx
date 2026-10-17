import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '../theme/AppearanceContext';
import { createInvitation } from '../features/invite/invitation';
import { copyInvitation, shareInvitation } from '../features/invite/invitationActions';
import { MotionPressable } from './MotionPressable';

export function AppInviteSheet({ name, onClose }: { name?: string; onClose: () => void }) {
  const { colors: c } = useAppearance();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const text = createInvitation(name);

  const act = async (action: 'copy' | 'share') => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setStatus('');
    if (action === 'copy') setCopied(false);
    try {
      if (action === 'copy') {
        await copyInvitation(text);
        setCopied(true);
        setStatus('Invitation copied. Paste it into any conversation.');
      } else {
        const result = await shareInvitation(text);
        if (result === 'unavailable') setStatus('Sharing is not available here. Use Copy invitation instead.');
      }
    } catch {
      setStatus(action === 'copy'
        ? 'Could not copy automatically. Select and copy the message above.'
        : 'Could not open sharing. You can still copy the invitation.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return <Modal transparent visible animationType="none" onRequestClose={onClose}>
    <View style={s.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close invitation" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View accessibilityViewIsModal style={[s.sheet, { backgroundColor: c.card, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={s.header}>
          <View style={s.heading}>
            <Text accessibilityRole="header" style={[s.title, { color: c.text }]}>Invite someone</Text>
            <Text style={[s.subtitle, { color: c.textSecondary }]}>Good company. More mindful miles.</Text>
          </View>
          <MotionPressable accessibilityLabel="Close invitation" onPress={onClose} style={[s.close, { backgroundColor: c.surfaceMuted }]}>
            <Ionicons name="close" size={22} color={c.text} />
          </MotionPressable>
        </View>
        <ScrollView style={s.preview} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator>
          <View style={[s.message, { backgroundColor: c.accentSoft }]}>
            <Text selectable style={[s.body, { color: c.text }]}>{text}</Text>
          </View>
        </ScrollView>
        <Text style={[s.note, { color: c.textSecondary }]}>Shares your name and the public link only. This does not add anyone to your family.</Text>
        <Text accessibilityLiveRegion="polite" style={[s.status, { color: c.accent }]}>{status}</Text>
        <View style={s.actions}>
          <MotionPressable accessibilityLabel={copied ? 'Copy invitation again' : 'Copy invitation'} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void act('copy')} style={[s.button, { backgroundColor: c.accent, opacity: busy ? 0.65 : 1 }]}>
            <Ionicons name={copied ? 'checkmark-outline' : 'copy-outline'} size={20} color={c.onAccent} />
            <Text style={[s.buttonText, { color: c.onAccent }]}>{busy ? 'Please wait…' : copied ? 'Copied' : 'Copy invitation'}</Text>
          </MotionPressable>
          <MotionPressable accessibilityLabel="Share invitation" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void act('share')} style={[s.button, s.share, { backgroundColor: c.accentSoft, opacity: busy ? 0.65 : 1 }]}>
            <Ionicons name="share-outline" size={20} color={c.accent} />
            <Text style={[s.buttonText, { color: c.accent }]}>Share</Text>
          </MotionPressable>
        </View>
        <Text style={[s.note, { color: c.textSecondary, textAlign: 'center' }]}>Choose Messages, Mail, WhatsApp or another available app.</Text>
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: '#071A1480', paddingTop: 24 },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '95%', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { flex: 1 },
  title: { fontSize: 23, fontFamily: 'Manrope_800ExtraBold' },
  subtitle: { fontSize: 13, lineHeight: 20, marginTop: 4 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  preview: { flexShrink: 1, marginTop: 8 },
  message: { padding: 20, borderRadius: 20 },
  body: { fontSize: 14, lineHeight: 22 },
  note: { fontSize: 12, lineHeight: 18 },
  status: { fontSize: 12, lineHeight: 18, minHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  button: { flexGrow: 1, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  share: { flexGrow: 0.5 },
  buttonText: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
});
