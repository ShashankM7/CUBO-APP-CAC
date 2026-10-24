import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Text, View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenShell } from '../components/ScreenShell';
import { AppHeader } from '../components/AppHeader';
import { MotionPressable } from '../components/MotionPressable';
import { useFamily } from '../features/family/FamilyContext';
import type { RootStackParamList } from '../navigation/types';
import { useAppearance } from '../theme/AppearanceContext';
import type { AppColors } from '../theme/colors';
import { useAppBlocking } from '../features/appBlocking/AppBlockingContext';
import { useConnections } from '../features/connections/ConnectionContext';
import { useAuth } from '../features/auth/AuthContext';
import { readDismissedNotificationIds, saveDismissedNotificationIds } from '../features/notifications/notificationDismissals';

const noticeKey = (source: 'family' | 'birth' | 'location' | 'blocking', id: string) => `${source}:${id}`;

export function NotificationsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Notifications'>) {
  const { colors: c } = useAppearance(); const s = styles(c);
  const family = useFamily(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set()); const [confirmClear, setConfirmClear] = useState(false);
  const appBlocking = useAppBlocking();
  const connections = useConnections(); const { user } = useAuth();
  useEffect(() => {
    let active = true;
    if (!user?.uid) { setDismissed(new Set()); return () => { active = false; }; }
    void readDismissedNotificationIds(user.uid).then(ids => { if (active) setDismissed(ids); });
    return () => { active = false; };
  }, [user?.uid]);

  const birthChanges = connections.birthDateRequests.filter(item => (item.organizerUid === user?.uid || item.minorUid === user?.uid) && !dismissed.has(noticeKey('birth', item.id)));
  const locationRequests = connections.locationShareRequests.filter(item => item.minorUid === user?.uid && item.status === 'pending' && !dismissed.has(noticeKey('location', item.id)));
  const familyNotices = family.notifications.filter(item => !dismissed.has(noticeKey('family', item.id)));
  const blockingNotices = appBlocking.notices.filter(item => !dismissed.has(noticeKey('blocking', item.id)));
  const allVisibleIds = useMemo(() => [
    ...familyNotices.map(item => noticeKey('family', item.id)),
    ...birthChanges.map(item => noticeKey('birth', item.id)),
    ...locationRequests.map(item => noticeKey('location', item.id)),
    ...blockingNotices.map(item => noticeKey('blocking', item.id)),
  ], [familyNotices, birthChanges, locationRequests, blockingNotices]);
  const unread = familyNotices.filter(item => !item.read).length + blockingNotices.filter(item => !item.read).length + birthChanges.filter(item => item.status === 'pending').length + locationRequests.length;

  const persistDismissed = (next: Set<string>) => {
    setDismissed(next); setError('');
    if (user?.uid) void saveDismissedNotificationIds(user.uid, next).catch(() => setError('Could not save that change. Please try again.'));
  };
  const dismissOne = (id: string) => persistDismissed(new Set([...dismissed, id]));
  const clearAll = () => { persistDismissed(new Set([...dismissed, ...allVisibleIds])); setConfirmClear(false); };
  const markAll = async () => {
    appBlocking.markNoticesRead(); setError('');
    if (!familyNotices.some(item => !item.read)) return;
    setBusy(true);
    try { await family.markRead(); } catch { setError('Could not mark synced notifications as read. Please try again.'); } finally { setBusy(false); }
  };
  const deleteButton = (id: string, title: string) => <MotionPressable accessibilityLabel={`Delete ${title} notification`} style={s.deleteButton} scaleTo={0.9} onPress={() => dismissOne(id)}><Ionicons name="trash-outline" size={18} color={c.danger} /></MotionPressable>;
  const card = (id: string, unreadCard: boolean, title: string, onPress: () => void, content: ReactNode) => <View key={id} style={[s.card, unreadCard && s.unread]}><MotionPressable style={s.cardTap} onPress={onPress}>{content}</MotionPressable>{deleteButton(id, title)}</View>;
  const total = allVisibleIds.length;

  return <ScreenShell>
    <AppHeader title="Notifications" onBack={() => navigation.goBack()} />
    <View style={s.toolbar}><Text style={s.body}>{unread ? unread + ' unread' : total ? 'You’re all caught up' : 'No new updates'}</Text><View style={s.toolbarActions}><MotionPressable accessibilityLabel="Mark all notifications as read" disabled={!unread || busy} onPress={() => void markAll()} style={[s.toolbarButton, (!unread || busy) && s.disabled]}><Ionicons name="checkmark-done-outline" size={17} color={c.accent} /><Text style={s.link}>{busy ? 'Updating…' : 'Mark read'}</Text></MotionPressable><MotionPressable accessibilityLabel="Clear all notifications" disabled={!total} onPress={() => setConfirmClear(true)} style={[s.toolbarButton, !total && s.disabled]}><Ionicons name="trash-outline" size={17} color={c.danger} /><Text style={s.clearLink}>Clear all</Text></MotionPressable></View></View>
    {total > 0 && <Text style={s.section}>Your updates</Text>}
    {familyNotices.map(notice => card(noticeKey('family', notice.id), !notice.read, notice.title, () => navigation.navigate('Family'), <><Text style={s.title}>{notice.title}</Text><Text style={s.body}>{notice.body}</Text><Text style={s.meta}>{new Date(notice.createdAt).toLocaleString()}</Text></>))}
    {birthChanges.map(request => card(noticeKey('birth', request.id), request.status === 'pending', 'account safety', () => request.organizerUid === user?.uid ? navigation.navigate('ConnectionProfile', { connectionId: request.connectionId }) : navigation.navigate('SettingsDetail', { kind: 'edit' }), <><View style={s.row}><View style={s.icon}><Ionicons name="calendar-outline" size={22} color={c.accent} /></View><View style={s.copy}><Text style={s.meta}>ACCOUNT SAFETY</Text><Text style={s.title}>{request.organizerUid === user?.uid ? `${request.minorName} requested an age change` : `Birth-date request ${request.status}`}</Text></View>{request.status === 'pending' && <View accessibilityLabel="Pending" style={s.dot} />}</View><Text style={s.body}>{request.previousBirthDate} → {request.requestedBirthDate}. {request.organizerUid === user?.uid ? request.status === 'pending' ? 'Open their profile to approve or deny it.' : `You ${request.status} this request.` : request.status === 'pending' ? `${request.organizerName} can approve or deny it.` : `Your organizer ${request.status} the change.`}</Text><View style={s.row}><Text style={[s.link, s.copy]}>{request.organizerUid === user?.uid ? 'Review Minor Profile' : 'View Account Details'}</Text><Ionicons name="chevron-forward" size={17} color={c.accent} /></View></>))}
    {locationRequests.map(request => card(noticeKey('location', request.id), true, 'location request', () => navigation.navigate('ConnectionProfile', { connectionId: request.connectionId }), <><View style={s.row}><View style={s.icon}><Ionicons name="navigate-outline" size={22} color={c.accent} /></View><View style={s.copy}><Text style={s.meta}>LOCATION REQUEST</Text><Text style={s.title}>{request.organizerName} asked for your location</Text></View><View accessibilityLabel="Pending" style={s.dot} /></View><Text style={s.body}>Your location remains private until you choose to share a one-time current-location snapshot.</Text><View style={s.row}><Text style={[s.link, s.copy]}>Review Request</Text><Ionicons name="chevron-forward" size={17} color={c.accent} /></View></>))}
    {blockingNotices.map(notice => card(noticeKey('blocking', notice.id), !notice.read, notice.title, () => { appBlocking.markNoticesRead(notice.id); navigation.navigate('AppBlocking', { targetUid: notice.targetUid, targetName: notice.targetName }); }, <><View style={s.row}><View style={s.icon}><Ionicons name="shield-checkmark" size={22} color={c.accent} /></View><View style={s.copy}><Text style={s.meta}>MINOR NOTIFICATION PREVIEW</Text><Text style={s.title}>{notice.title}</Text></View>{!notice.read && <View accessibilityLabel="Unread" style={s.dot} />}</View><Text style={s.body}>{notice.body}</Text><View style={s.row}><Text style={[s.link, s.copy]}>Review Blocked Apps</Text><Ionicons name="chevron-forward" size={17} color={c.accent} /></View></>))}
    {!total ? <View style={s.empty}><View style={s.emptyIcon}><Ionicons name="notifications-outline" size={30} color={c.accent} /></View><Text style={s.title}>No notifications yet</Text><Text style={s.body}>Real family requests and account updates will appear here.</Text></View> : null}
    {!!error && <Text accessibilityRole="alert" style={{ color: c.danger }}>{error}</Text>}
    <Modal visible={confirmClear} transparent animationType="fade" onRequestClose={() => setConfirmClear(false)}><View style={s.scrim}><View accessibilityViewIsModal style={s.dialog}><View style={s.dialogIcon}><Ionicons name="trash-outline" size={24} color={c.danger} /></View><Text style={s.dialogTitle}>Clear all notifications?</Text><Text style={s.dialogBody}>This removes every notification currently shown on this device. New updates will still appear normally.</Text><MotionPressable style={s.clearButton} onPress={clearAll}><Text style={s.clearButtonText}>Clear all</Text></MotionPressable><MotionPressable style={s.keepButton} onPress={() => setConfirmClear(false)}><Text style={s.keepButtonText}>Keep notifications</Text></MotionPressable></View></View></Modal>
  </ScreenShell>;
}

const styles = (c: AppColors) => StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 6 }, toolbarButton: { minHeight: 44, paddingHorizontal: 9, borderRadius: 14, backgroundColor: c.surfaceMuted, flexDirection: 'row', alignItems: 'center', gap: 5 }, disabled: { opacity: .42 },
  section: { color: c.text, fontSize: 18, fontFamily: 'Manrope_800ExtraBold', marginTop: 8 },
  card: { position: 'relative', backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }, cardTap: { padding: 18, paddingRight: 62, gap: 14 }, deleteButton: { position: 'absolute', right: 10, top: 10, width: 44, height: 44, borderRadius: 14, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  unread: { borderColor: c.borderStrong }, row: { flexDirection: 'row', gap: 12, alignItems: 'center' }, copy: { flex: 1 },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.accentSoft, justifyContent: 'center', alignItems: 'center' }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C93636' },
  title: { color: c.text, fontSize: 15, lineHeight: 22, fontFamily: 'Manrope_700Bold' }, body: { color: c.textSecondary, fontSize: 13, lineHeight: 20 }, meta: { color: c.textSecondary, fontSize: 11 }, link: { color: c.accent, fontSize: 12, fontFamily: 'Manrope_700Bold' }, clearLink: { color: c.danger, fontSize: 12, fontFamily: 'Manrope_700Bold' },
  empty: { minHeight: 200, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: c.borderStrong, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', gap: 7, padding: 24 }, emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,.58)', alignItems: 'center', justifyContent: 'center', padding: 24 }, dialog: { width: '100%', maxWidth: 390, borderRadius: 26, padding: 24, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong }, dialogIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, dialogTitle: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 20, textAlign: 'center', marginTop: 16 }, dialogBody: { color: c.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 }, clearButton: { minHeight: 50, borderRadius: 16, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center', marginTop: 20 }, clearButtonText: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 13 }, keepButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, keepButtonText: { color: c.textSecondary, fontFamily: 'Manrope_700Bold', fontSize: 13 },
});
