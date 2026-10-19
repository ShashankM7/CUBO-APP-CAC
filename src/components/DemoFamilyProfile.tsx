import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { AppState, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { demoFamily } from '../features/family/demoFamily';
import { demoRoute, demoSafetyEvents } from '../features/family/demoRoute';
import type { RootStackParamList } from '../navigation/types';
import { useAppearance } from '../theme/AppearanceContext';
import { ScreenShell } from './ScreenShell';
import { AppHeader } from './AppHeader';
import { MotionPressable } from './MotionPressable';
import { FamilyAvatar } from './FamilyAvatar';
import { TripRouteSnapshot } from './TripRouteSnapshot';
import { DemoLiveMap } from './DemoLiveMap';
import { DemoFamilyInsurance } from './DemoFamilyInsurance';
import { DrivingAppLimitsCard } from './DrivingAppLimitsCard';

export function DemoFamilyProfile({ member, navigation }: { member: typeof demoFamily[number]; navigation: NativeStackNavigationProp<RootStackParamList, 'FamilyMember'> }) {
  const { colors: c } = useAppearance();
  const focused = useIsFocused();
  const sharing = member.uid === 'demo-teen-2';
  const [requested, setRequested] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!sharing || !focused || !playing) return;
    const interval = setInterval(() => { if (AppState.currentState === 'active') setProgress(value => Math.min(1, value + .004)); }, 250);
    return () => clearInterval(interval);
  }, [sharing, focused, playing]);
  const body = { color: c.textSecondary, fontSize: 13, lineHeight: 20 };
  const heading = { color: c.text, fontSize: 19, fontFamily: 'Manrope_800ExtraBold' };
  return <ScreenShell>
    <AppHeader title={member.name} onBack={() => navigation.goBack()} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12 }}>
      <FamilyAvatar id={member.uid} size={88} />
      <View style={{ flex: 1, gap: 6 }}><Text style={heading}>{member.name}</Text><Text style={{ color: c.accent, fontFamily: 'Manrope_700Bold' }}>{member.role}</Text><Text style={body}>{sharing ? 'Sharing location · Demo' : 'Location private · Demo'}</Text></View>
    </View>
    <Text style={body}>DEMO FAMILY · Fictional people, trips and locations.</Text>
    <View style={{ padding: 24, borderRadius: 24, backgroundColor: '#183D2D', gap: 8 }}>
      <Text style={{ color: '#D1E3D7', fontSize: 11, letterSpacing: 1 }}>THIS MONTH · SAMPLE SAFETY</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}><Text style={{ color: '#FFFFFF', fontSize: 52, fontFamily: 'Manrope_800ExtraBold' }}>{member.score}</Text><View style={{ flex: 1 }}><Text style={{ color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 17 }}>{member.score >= 90 ? 'Steady driving' : 'Room to improve'}</Text><Text style={{ color: '#D1E3D7', fontSize: 12, lineHeight: 18 }}>Attention and consistency across sample trips.</Text></View></View>
    </View>
    <View style={{ flexDirection: 'row', gap: 8 }}>{[[Math.floor(member.minutes / 60) + 'h ' + member.minutes % 60 + 'm', 'Drive time'], [String(member.miles), 'Miles'], [String(member.trips), 'Trips']].map(([value, label]) => <View key={label} style={{ flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: c.card, alignItems: 'center', gap: 4 }}><Text style={{ color: c.text, fontSize: 17, fontFamily: 'Manrope_800ExtraBold' }}>{value}</Text><Text style={body}>{label}</Text></View>)}</View>
    {!member.adult ? <DrivingAppLimitsCard targetUid={member.uid} targetName={member.name} navigation={navigation} /> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={heading}>{sharing ? 'Driving now' : 'Location sharing'}</Text><Ionicons name={sharing ? 'navigate-circle' : 'lock-closed-outline'} size={24} color={c.accent} /></View>
    {sharing ? <>
      <Text style={body}>Child 2 has location sharing enabled in this demo. Downtown Raleigh · {progress >= 1 ? 'Trip complete' : 'Simulated trip in progress'}</Text>
      <DemoLiveMap progress={progress} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={body}>SIMULATED LIVE · {Math.round(progress * 100)}% of route</Text><MotionPressable accessibilityLabel={progress >= 1 ? 'Replay demo drive' : playing ? 'Pause demo drive' : 'Resume demo drive'} onPress={() => { if (progress >= 1) { setProgress(0); setPlaying(true); } else setPlaying(value => !value); }} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}><Text style={{ color: c.accent }}>{progress >= 1 ? 'Replay' : playing ? 'Pause' : 'Resume'}</Text></MotionPressable></View>
      <Text style={body}>Fictional movement only. No live GPS or real person is being tracked.</Text>
    </> : <View style={{ padding: 20, borderRadius: 20, borderWidth: 1, borderColor: c.borderStrong, gap: 12 }}>
      <Text style={body}>{requested ? 'Demo request pending. Location remains private until they approve. No message was sent.' : 'Ask for permission to see shared trips and live location. They choose whether to share.'}</Text>
      <MotionPressable disabled={requested} onPress={() => setRequested(true)} style={{ minHeight: 50, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.accent, fontFamily: 'Manrope_700Bold' }}>{requested ? 'Demo request pending' : 'Request location sharing'}</Text></MotionPressable>
    </View>}
    <Text style={heading}>Safety moments</Text>
    <Text style={body}>Fictional example map · 2 attention events. These locations are demo illustrations, not private location data.</Text>
    <TripRouteSnapshot points={demoRoute} hazards={demoSafetyEvents} accent={c.accent} background={c.mapSurface} />
    {demoSafetyEvents.map((event, index) => <View key={event.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: c.border }}><View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.amberSoft, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="eye-outline" size={20} color={c.amber} /></View><View style={{ flex: 1 }}><Text style={{ color: c.text, fontFamily: 'Manrope_700Bold' }}>{event.title}</Text><Text style={body}>Sample trip · {index ? '3:00' : '1:00'} into drive</Text></View></View>)}
    {member.adult ? <><Text style={body}>Parent/Guardian · Can review minors’ shared safety summaries. Only the organizer manages membership and roles.</Text><DemoFamilyInsurance name={member.name} score={member.score} /></> : <Text style={body}>Insurance reporting is not included for minors in this demo.</Text>}
  </ScreenShell>;
}
