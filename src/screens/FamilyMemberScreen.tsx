import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenShell } from '../components/ScreenShell';
import { AppHeader } from '../components/AppHeader';
import { findDemoMember } from '../features/family/demoFamily';
import { DemoFamilyProfile } from '../components/DemoFamilyProfile';
import { useFamily } from '../features/family/FamilyContext';
import { useEffect, useState } from 'react';
import { familyRequest } from '../features/family/familyApi';
import type { RootStackParamList } from '../navigation/types';
import { useAppearance } from '../theme/AppearanceContext';
import type { AppColors } from '../theme/colors';
import { useAuth } from '../features/auth/AuthContext';
import { DrivingAppLimitsCard } from '../components/DrivingAppLimitsCard';
export type SharedDrive = { id: string; endedAt: string; vehicleName: string; durationSeconds: number; distanceMiles: number; focusScore: number | null; alertCount: number };
export function FamilyMemberScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'FamilyMember'>) {
  const { colors: c } = useAppearance();
  const s = makeThemeStyles(c);

  const family = useFamily(); const { members, configured } = family; const member = members.find(person => person.uid === route.params.uid);
  const { user } = useAuth();
  const [drives, setDrives] = useState<SharedDrive[]>([]); const [message, setMessage] = useState('Loading shared drives…');
  useEffect(() => { let active = true; if (!member || !configured) return; familyRequest<SharedDrive[]>(`/family/member/${encodeURIComponent(member.uid)}/drives`).then(result => { if (active) { setDrives(result); setMessage(result.length ? '' : 'No shared drives yet.'); } }).catch(error => { if (active) setMessage(error.message); }); return () => { active = false; }; }, [member?.uid, configured]);
  const demoMember = findDemoMember(route.params.uid);
  if (demoMember) return <DemoFamilyProfile member={demoMember} navigation={navigation} />;
  return <ScreenShell><AppHeader title={member?.name ?? 'Family member'} onBack={() => navigation.goBack()} /><Text style={s.body}>{member ? member.role === 'organizer' ? 'Family organizer' : 'Family member · Sharing by consent' : 'This person is no longer in your family.'}</Text>
    <Text style={s.heading}>Driving & safety</Text>{member ? <Text style={s.body}>{message}</Text> : null}
    {member?.accountType === 'minor' && family.organizerUid === user?.uid ? <DrivingAppLimitsCard targetUid={member.uid} targetName={member.name} navigation={navigation} /> : null}
    {drives.map(drive => <View style={s.card} key={drive.id}><Text style={s.heading}>{drive.vehicleName}</Text><Text style={s.body}>{new Date(drive.endedAt).toLocaleDateString()} · {Math.floor(drive.durationSeconds / 60)}m {drive.durationSeconds % 60}s · {drive.distanceMiles.toFixed(1)} mi</Text><Text style={s.body}>{drive.focusScore === null ? 'Attention scoring unavailable' : `Focus score: ${drive.focusScore}`} · {drive.alertCount} safety events</Text></View>)}
    <Text style={s.body}>Camera footage and precise routes are not shared with family.</Text>
  </ScreenShell>;
}
const makeThemeStyles = (c: AppColors) => StyleSheet.create({ heading: { fontSize: 18, color: c.text, fontFamily: 'Manrope_700Bold' }, body: { fontSize: 13, lineHeight: 20, color: c.textSecondary }, card: { padding: 20, borderRadius: 20, backgroundColor: c.card, gap: 8 } });
