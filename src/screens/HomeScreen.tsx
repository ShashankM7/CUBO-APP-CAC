import { Ionicons } from '@expo/vector-icons';
import { CompositeNavigationProp, NavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { HomeCockpit } from '../components/HomeCockpit';
import { MotionPressable } from '../components/MotionPressable';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { ScreenShell } from '../components/ScreenShell';
import { VehicleArt } from '../components/VehicleArt';
import { useAppBlocking } from '../features/appBlocking/AppBlockingContext';
import { useAuth } from '../features/auth/AuthContext';
import { readCalibration, type CalibrationRecord } from '../features/calibration/calibrationStatus';
import { useConnections } from '../features/connections/ConnectionContext';
import { useDrives } from '../features/drives/DriveContext';
import { useFamily } from '../features/family/FamilyContext';
import { accessError } from '../features/permissions/accessErrors';
import { checkMediaAccess, requestMediaAccess } from '../features/permissions/mediaAccess';
import { usePlaces } from '../features/places/PlacesContext';
import { PlaceResult } from '../features/places/searchPlaces';
import { useProfile } from '../features/profile/ProfileContext';
import { useVehicles } from '../features/vehicles/VehicleContext';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useAppearance } from '../theme/AppearanceContext';
import type { AppColors } from '../theme/colors';

const locationLabel = (value: string) => /allowed|verified/i.test(value) ? 'Ready' : /blocked|not allowed/i.test(value) ? 'Needs access' : 'On demand';

export function HomeScreen() {
  const { colors: c, mode } = useAppearance();
  const s = makeThemeStyles(c);
  const { width } = useWindowDimensions();
  const navigation = useNavigation<CompositeNavigationProp<NavigationProp<MainTabParamList>, NavigationProp<RootStackParamList>>>();
  const { profile } = useProfile();
  const { vehicles, setPrimary } = useVehicles();
  const { activeSession, sessions } = useDrives();
  const places = usePlaces();
  const family = useFamily();
  const connections = useConnections();
  const { user } = useAuth();
  const appBlocking = useAppBlocking();
  const unreadCount = family.notifications.filter(item => !item.read).length + appBlocking.notices.filter(item => !item.read).length;
  const [calibration, setCalibration] = useState<CalibrationRecord | null>(null);
  const [locationStatus, setLocationStatus] = useState('On demand');
  const [locationMessage, setLocationMessage] = useState('');
  const [locationBusy, setLocationBusy] = useState(false);
  const locationRequest = useRef<AbortController | null>(null);
  const vehiclePagerRef = useRef<ScrollView>(null);
  const vehicleScrollX = useRef(new Animated.Value(0)).current;
  const [vehiclePage, setVehiclePage] = useState(0);
  const [vehiclePageWidth, setVehiclePageWidth] = useState(Math.max(280, Math.min(386, width - 44)));

  useFocusEffect(useCallback(() => {
    let active = true;
    void readCalibration().then(value => { if (active) setCalibration(value); });
    void checkMediaAccess('location').then(value => { if (active) setLocationStatus(locationLabel(value)); }).catch(() => undefined);
    return () => {
      active = false;
      locationRequest.current?.abort();
      locationRequest.current = null;
      setLocationBusy(false);
    };
  }, []));

  const selected = vehicles.find(vehicle => vehicle.primary) ?? vehicles[0];
  const measuredDrives = sessions.filter(item => item.attentionMeasured);
  const safetyScore = measuredDrives.length ? Math.round(measuredDrives.reduce((sum, item) => sum + item.focusScore, 0) / measuredDrives.length) : 100;
  const blockingPolicy = appBlocking.policyFor(user?.uid, profile.name || 'You');
  const vehiclePages = [...vehicles, null];
  const go = (destination?: PlaceResult) => navigation.navigate('DriveMap', destination ? { destination } : undefined);

  const settleVehiclePage = (offset: number) => {
    const next = Math.max(0, Math.min(vehiclePages.length - 1, Math.round(offset / Math.max(1, vehiclePageWidth))));
    setVehiclePage(next);
  };
  const showVehiclePage = (index: number) => {
    const next = Math.max(0, Math.min(vehiclePages.length - 1, index));
    setVehiclePage(next);
    vehiclePagerRef.current?.scrollTo({ x: next * vehiclePageWidth, y: 0, animated: true });
  };

  useEffect(() => {
    setVehiclePage(current => Math.min(current, Math.max(0, vehiclePages.length - 1)));
  }, [vehiclePages.length]);

  async function enableLocation() {
    if (locationRequest.current || locationBusy) return;
    if (activeSession) {
      setLocationMessage('End your drive before changing location access.');
      return;
    }
    const request = new AbortController();
    locationRequest.current = request;
    setLocationBusy(true);
    setLocationMessage('');
    try {
      const result = await requestMediaAccess('location', request.signal);
      setLocationStatus(locationLabel(result));
      setLocationMessage('Location is ready and will only be used when a feature needs it. This check was discarded.');
    } catch (cause) {
      if (!request.signal.aborted) {
        setLocationStatus('Needs access');
        setLocationMessage(accessError(cause));
      }
    } finally {
      if (locationRequest.current === request) locationRequest.current = null;
      setLocationBusy(false);
    }
  }

  return <ScreenShell edgeToEdge safeAreaColor={mode === 'dark' ? '#1B2022' : '#0B3023'}>
    <HomeCockpit name={profile.name} avatarId={profile.avatarId}
      photoUri={profile.photoUri}
      uid={user?.uid}
      score={safetyScore} measured={measuredDrives.length}
      active={!!activeSession}
      unread={unreadCount}
      onAccount={() => navigation.navigate('Account')}
      onNotifications={() => navigation.navigate('Notifications')}
      onActivity={() => navigation.navigate('Activity')}
      onInsurance={() => navigation.navigate('InsuranceConnection')}
    />

    <View style={s.content}>
      <MotionPressable accessibilityLabel="Choose a destination" style={s.search} onPress={() => go()}>
        <Ionicons name="search-outline" size={23} color={c.text} />
        <Text style={s.searchText}>Where are you going?</Text>
        <View style={s.searchArrow}><Ionicons name="arrow-forward" size={20} color="#FFFFFF" /></View>
      </MotionPressable>

      <View style={s.saved}>{(['home', 'work'] as const).map(kind => <MotionPressable key={kind} style={s.savedItem} onPress={() => places[kind] ? go(places[kind]) : navigation.navigate('SavedPlace', { kind })} onLongPress={() => navigation.navigate('SavedPlace', { kind })}>
        <View style={s.smallIcon}><Ionicons name={kind === 'home' ? 'home-outline' : 'briefcase-outline'} size={19} color={c.secondaryInk} /></View>
        <View style={s.fill}><Text style={s.label}>{kind === 'home' ? 'Home' : 'Work'}</Text><Text numberOfLines={1} style={s.meta}>{places[kind]?.title ?? 'Set address'}</Text></View>
      </MotionPressable>)}</View>

      <MotionPressable accessibilityLabel="Ask Cubo Assistant" style={s.assistant} onPress={() => navigation.navigate('CuboAI')}>
        <View pointerEvents="none" style={s.assistantContents}><Ionicons name="sparkles-outline" size={25} color={c.accent} />
          <View style={s.fill}><Text style={[s.label, s.assistantTitle]}>Ask Cubo Assistant</Text><Text style={s.meta}>Your drive, your questions. Just ask.</Text></View>
          <Ionicons name="pulse-outline" size={24} color={c.accent} />
        </View>
      </MotionPressable>

      <View style={s.readinessRow}>
        {([
          { icon: 'camera-outline', title: 'Camera', status: calibration ? 'Ready' : 'Set up', onPress: () => navigation.navigate('CameraCalibration'), disabled: false },
          { icon: 'location-outline', title: 'Location', status: 'On demand', onPress: enableLocation, disabled: locationBusy },
          { icon: 'shield-checkmark-outline', title: 'Blocked Apps', status: blockingPolicy.enabled ? 'Configured' : 'Optional', onPress: () => navigation.navigate('AppBlocking'), disabled: false },
        ] as const).map(item => { const status = item.title === 'Location' ? locationBusy ? 'Checking…' : locationStatus : item.status; return <MotionPressable key={item.title} disabled={item.disabled} accessibilityLabel={`${item.title}: ${status}`} onPress={item.onPress} style={s.readinessItem}>
          <View style={s.readinessIcon}><Ionicons name={item.icon} size={21} color={c.accent} /></View>
          <Text style={s.readinessTitle}>{item.title}</Text><Text style={s.readinessStatus}>{status}</Text>
        </MotionPressable>; })}
      </View>
      {!!locationMessage && <View style={s.locationNotice}><Ionicons name={locationStatus === 'Ready' ? 'checkmark-circle-outline' : 'information-circle-outline'} size={17} color={c.accent} /><Text accessibilityLiveRegion="polite" style={s.locationNoticeText}>{locationMessage}</Text></View>}

      <View style={s.sectionHeader}><View><Text style={s.section}>Your Garage</Text><Text style={s.sectionHint}>Swipe to choose your active vehicle.</Text></View><MotionPressable onPress={() => navigation.navigate('Garage')}><Text style={s.link}>Manage</Text></MotionPressable></View>
      <View style={s.vehiclePager} onLayout={event => setVehiclePageWidth(event.nativeEvent.layout.width)}>
        <Animated.ScrollView
          ref={vehiclePagerRef}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          snapToInterval={vehiclePageWidth}
          snapToAlignment="start"
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: vehicleScrollX } } }], { useNativeDriver: false, listener: (event: any) => settleVehiclePage(event.nativeEvent.contentOffset.x) })}
          onScrollEndDrag={event => settleVehiclePage(event.nativeEvent.contentOffset.x)}
          onMomentumScrollEnd={event => settleVehiclePage(event.nativeEvent.contentOffset.x)}
        >
          {vehiclePages.map((vehicle, index) => {
            const inputRange = [(index - 1) * vehiclePageWidth, index * vehiclePageWidth, (index + 1) * vehiclePageWidth];
            const motion = { opacity: vehicleScrollX.interpolate({ inputRange, outputRange: [.7, 1, .7], extrapolate: 'clamp' }), transform: [{ scale: vehicleScrollX.interpolate({ inputRange, outputRange: [.96, 1, .96], extrapolate: 'clamp' }) }] };
            if (!vehicle) return <Animated.View key="add-vehicle" style={[s.vehiclePage, { width: vehiclePageWidth }, motion]}><MotionPressable accessibilityLabel="Add another vehicle" style={s.addVehicleCard} onPress={() => navigation.navigate('AddVehicle')}><View style={s.addVehicleIcon}><Ionicons name="add" size={46} color={c.accent} /></View><Text style={s.addVehicleTitle}>{vehicles.length ? 'Add another vehicle' : 'Add your first vehicle'}</Text><Text style={s.addVehicleMeta}>Choose the car you use for drives.</Text></MotionPressable></Animated.View>;
            const isSelected = vehicle.id === selected?.id;
            return <Animated.View key={vehicle.id} style={[s.vehiclePage, { width: vehiclePageWidth }, motion]}><MotionPressable accessibilityLabel={`${isSelected ? 'Selected' : 'Select'} ${vehicle.make} ${vehicle.model}`} accessibilityState={{ selected: isSelected }} style={[s.vehicleStage, isSelected && s.vehicleStageSelected]} onPress={() => setPrimary(vehicle.id)}>
              <View style={s.vehicleGlow} />
              <View style={s.vehicleStageCopy}><View style={s.activePill}><View style={[s.activeDot, !isSelected && { backgroundColor: 'rgba(240,252,246,.45)' }]} /><Text style={s.activePillText}>{isSelected ? 'ACTIVE VEHICLE' : 'TAP TO SELECT'}</Text></View><Text style={s.vehicleStageTitle}>{vehicle.make} {vehicle.model}</Text><Text style={s.vehicleStageMeta}>{vehicle.year || 'Year not set'} · {vehicle.plate || vehicle.nickname}</Text><View style={s.vehicleStageAction}><Text style={s.vehicleStageActionText}>{isSelected ? 'Selected' : 'Select vehicle'}</Text><Ionicons name={isSelected ? 'checkmark' : 'arrow-forward'} size={16} color={c.featureActionText} /></View></View>
              <View style={s.vehicleStageArt}><VehicleArt make={vehicle.make} model={vehicle.model} paint={vehicle.paint} width={185} height={112} /></View>
            </MotionPressable></Animated.View>;
          })}
        </Animated.ScrollView>
      </View>
      <View accessibilityRole="tablist" style={s.vehicleDots}>{vehiclePages.map((vehicle, index) => <MotionPressable key={vehicle?.id ?? 'add-dot'} accessibilityRole="tab" accessibilityLabel={vehicle ? `Show ${vehicle.make} ${vehicle.model}` : 'Show add vehicle'} accessibilityState={{ selected: index === vehiclePage }} onPress={() => showVehiclePage(index)} scaleTo={.9} style={s.vehicleDotTarget}><View style={[s.vehicleDot, index === vehiclePage && s.vehicleDotActive]} /></MotionPressable>)}</View>

      <View style={s.sectionHeader}><View><Text style={s.section}>Family / Friends</Text><Text style={s.sectionHint}>The people you choose to stay connected with.</Text></View><MotionPressable onPress={() => navigation.navigate('Connections')}><Text style={s.link}>Manage</Text></MotionPressable></View>
      <View style={s.peoplePanel}>
        {connections.connections.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.peopleScroller}>{connections.connections.map(item => {
          const mine = item.ownerUid === user?.uid;
          const name = mine ? item.memberName : item.ownerName;
          const avatarId = mine ? item.memberAvatarId : item.ownerAvatarId;
          const otherUid = mine ? item.memberUid : item.ownerUid;
          return <MotionPressable key={item.id} accessibilityLabel={`View ${name}'s profile`} style={s.personTile} onPress={() => navigation.navigate('ConnectionProfile', { connectionId: item.id })}>
            <View style={s.personAvatar}><ProfileAvatar avatarId={avatarId} uid={otherUid} size={58} rounded /></View>
            <Text numberOfLines={1} style={s.personName}>{name.split(' ')[0]}</Text>
            <Text style={s.personRole}>{item.kind === 'family' ? 'Family' : 'Friend'}</Text>
          </MotionPressable>;
        })}</ScrollView> : <View style={s.peopleEmpty}><View style={s.connectionEmptyIcon}><Ionicons name="people-outline" size={22} color={c.accent} /></View><View style={s.fill}><Text style={s.panelTitle}>No one connected yet</Text><Text style={s.panelMeta}>Codes link real CUBO accounts with approval.</Text></View></View>}
        <View style={s.joinActions}><MotionPressable style={s.joinPrimary} onPress={() => navigation.navigate('Connections', { action: 'enter' })}><Ionicons name="keypad-outline" size={18} color={c.onAccent} /><Text style={s.joinPrimaryText}>Enter Code</Text></MotionPressable><MotionPressable style={s.joinSecondary} onPress={() => navigation.navigate('Connections', { action: 'create' })}><Ionicons name="add-circle-outline" size={18} color={c.accent} /><Text style={s.joinSecondaryText}>Create Code</Text></MotionPressable></View>
      </View>
    </View>
  </ScreenShell>;
}

const makeThemeStyles = (c: AppColors) => StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 22, gap: 12 },
  search: { marginTop: -32, minHeight: 68, borderRadius: 18, flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: c.shortcutSurface, paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong, shadowColor: c.shadow, shadowOpacity: .11, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  searchText: { flex: 1, color: c.shortcutText, fontSize: 17, fontFamily: 'Manrope_700Bold' },
  searchArrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#104C32', alignItems: 'center', justifyContent: 'center' },
  saved: { flexDirection: 'row', gap: 10, marginTop: 5 },
  savedItem: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 18, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
  smallIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: c.secondarySurface, alignItems: 'center', justifyContent: 'center' },
  label: { color: c.text, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  meta: { color: c.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 3 },
  assistant: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 76, borderRadius: 18, backgroundColor: c.accentSoft },
  assistantContents: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  assistantTitle: { fontSize: 16 },
  readinessRow: { flexDirection: 'row', paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  readinessItem: { flex: 1, alignItems: 'center', gap: 5 },
  readinessIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: c.secondarySurface },
  readinessTitle: { color: c.text, fontFamily: 'Manrope_700Bold', fontSize: 12 },
  readinessStatus: { color: c.textSecondary, fontSize: 11 },
  locationNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: c.accentSoft },
  locationNoticeText: { flex: 1, color: c.textSecondary, fontSize: 11, lineHeight: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 6 },
  section: { color: c.text, fontSize: 20, fontFamily: 'Manrope_800ExtraBold' },
  sectionHint: { color: c.textSecondary, fontSize: 10, marginTop: 3 },
  link: { color: c.accent, fontSize: 12, fontFamily: 'Manrope_700Bold', padding: 8 },
  vehiclePager: { width: '100%', overflow: 'hidden', borderRadius: 26 },
  vehiclePage: { paddingHorizontal: 0 },
  vehicleStage: { minHeight: 208, borderRadius: 26, padding: 20, overflow: 'hidden', backgroundColor: c.featureSurface, flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: 'transparent' },
  vehicleStageSelected: { borderColor: 'rgba(113,211,164,.34)' },
  vehicleGlow: { position: 'absolute', width: 230, height: 230, borderRadius: 115, right: -82, top: -70, backgroundColor: 'rgba(99,207,147,.15)' },
  vehicleStageCopy: { flex: 1.08, zIndex: 2, justifyContent: 'center', alignItems: 'flex-start' },
  activePill: { minHeight: 26, borderRadius: 13, paddingHorizontal: 9, backgroundColor: 'rgba(255,255,255,.1)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#70D6A2' },
  activePillText: { color: 'rgba(240,252,246,.72)', fontFamily: 'Manrope_800ExtraBold', fontSize: 7, letterSpacing: .9 },
  vehicleStageTitle: { color: '#FFFFFF', fontFamily: 'Manrope_800ExtraBold', fontSize: 21, lineHeight: 25, letterSpacing: -.5, marginTop: 14 },
  vehicleStageMeta: { color: 'rgba(233,249,240,.62)', fontSize: 10, marginTop: 5 },
  vehicleStageAction: { minHeight: 42, borderRadius: 13, backgroundColor: c.featureAction, paddingHorizontal: 13, marginTop: 17, flexDirection: 'row', alignItems: 'center', gap: 8 },
  vehicleStageActionText: { color: c.featureActionText, fontFamily: 'Manrope_800ExtraBold', fontSize: 11 },
  vehicleStageArt: { flex: 1, alignItems: 'center', justifyContent: 'center', marginRight: -26 },
  addVehicleCard: { minHeight: 208, borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.borderStrong, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', padding: 22 },
  addVehicleIcon: { width: 82, height: 82, borderRadius: 41, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  addVehicleTitle: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 16 },
  addVehicleMeta: { color: c.textSecondary, fontSize: 11, marginTop: 4 },
  vehicleDots: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  vehicleDotTarget: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  vehicleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.borderStrong },
  vehicleDotActive: { width: 20, backgroundColor: c.accent },
  peoplePanel: { borderRadius: 24, padding: 16, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  peopleScroller: { gap: 14, paddingVertical: 4, paddingRight: 12 },
  personTile: { width: 72, alignItems: 'center' },
  personAvatar: { width: 62, height: 62, borderRadius: 31, padding: 2, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceMuted },
  personName: { width: '100%', textAlign: 'center', color: c.text, fontFamily: 'Manrope_700Bold', fontSize: 11, marginTop: 8 },
  personRole: { color: c.textSecondary, fontSize: 9, marginTop: 2 },
  peopleEmpty: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  connectionEmptyIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 14 },
  panelMeta: { color: c.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
  joinActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  joinPrimary: { flex: 1, minHeight: 48, borderRadius: 15, backgroundColor: c.accent, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  joinPrimaryText: { color: c.onAccent, fontFamily: 'Manrope_800ExtraBold', fontSize: 12 },
  joinSecondary: { flex: 1, minHeight: 48, borderRadius: 15, backgroundColor: c.card, borderWidth: 1, borderColor: c.borderStrong, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  joinSecondaryText: { color: c.accent, fontFamily: 'Manrope_800ExtraBold', fontSize: 12 },
});
