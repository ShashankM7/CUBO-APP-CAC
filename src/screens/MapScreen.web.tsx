import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useRoute, useNavigation, usePreventRemove, type NavigationProp } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Keyboard, Modal, Platform, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import MapView, { Marker, Polyline, type MapStyleMode, type MapView as MapHandle, type Region } from '../components/DrivingMap.web';
import Reanimated, { Easing, FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlaceSuggestions } from '../features/places/usePlaceSuggestions';
import { searchPlaces, type PlaceResult } from '../features/places/searchPlaces';
import { RecentDestinations } from '../components/RecentDestinations';
import { usePlaces } from '../features/places/PlacesContext';
import { DriveAttentionCamera } from '../components/DriveAttentionCamera';
import { DriveVoiceControl } from '../components/DriveVoiceControl.web';
import { MotionPressable } from '../components/MotionPressable';
import { useDrives } from '../features/drives/DriveContext';
import { snapPipCorner, isAhead } from '../features/drives/mapGeometry';
import { elapsedSeconds } from '../features/drives/formatDuration';
import { SURVEY_TIMEOUT_MS } from '../features/drives/roadReportPolicy';
import { useRoadReports, type RoadReport } from '../features/drives/useRoadReports';
import type { RoadHazardKind } from '../features/drives/types';
import { parseDrivingRoute } from '../features/navigation/routeResponse';
import { remainingRoute } from '../features/navigation/remainingRoute';
import { VoiceRoutes } from '../features/navigation/voiceRoutes';
import { useDriveLocation } from '../hooks/useDriveLocation.web';
import type { RootStackParamList } from '../navigation/types';
import { useAppearance } from '../theme/AppearanceContext';
import type { AppColors } from '../theme/colors';
import { spacing } from '../theme/theme';
import { useAppBlocking, type DriveBlockPlan } from '../features/appBlocking/AppBlockingContext';
import { DriveBlockModal } from '../components/DriveBlockModal';
import { distanceToRouteMeters, LiveNavigationTracker } from '../features/navigation/liveNavigation';
import { CuboAIVoice, isRecoverableMicrophoneFailure } from '../features/cuboAI/browserVoice';
import { readVoicePreference } from '../features/cuboAI/voicePreference';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { useProfile } from '../features/profile/ProfileContext';
import { useAuth } from '../features/auth/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { VoiceAssistIcon } from '../components/VoiceAssistIcon';
import { accessError } from '../features/permissions/accessErrors';
import { requestMediaAccess } from '../features/permissions/mediaAccess';
import { MAP_DROID_VISIBILITY_EVENT, readMapDroidVisible } from '../features/cuboAI/droidPreference';

const fallbackRegion: Region = { latitude: 35.7796, longitude: -78.6382, latitudeDelta: .035, longitudeDelta: .035 };
const hazardMeta: Record<RoadHazardKind, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  object: { icon: 'cube-outline', color: '#FFB020' }, police: { icon: 'shield-outline', color: '#FF8A1F' }, crash: { icon: 'warning-outline', color: '#FF453A' },
};
const hazardOptions: Array<{ kind: RoadHazardKind; label: string; detail: string }> = [
  { kind: 'object', label: 'Object', detail: 'Debris or stopped object' },
  { kind: 'police', label: 'Police', detail: 'Police activity ahead' },
  { kind: 'crash', label: 'Crash', detail: 'Collision or blocked lane' },
];
type PlaceSuggestion = { id: string; title: string; subtitle: string; latitude: number; longitude: number };
type Coordinate = { latitude: number; longitude: number };
type NavigationStep = { location: Coordinate; distanceMeters: number; name: string; type: string; modifier?: string };
type NavigationRoute = { coordinates: Coordinate[]; distanceMeters: number; durationSeconds: number; steps: NavigationStep[] };

function distanceMeters(a: Coordinate, b: Coordinate) {
  const radius = 6371000;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function stepInstruction(step?: NavigationStep) {
  if (!step) return 'Continue toward your destination';
  if (step.type === 'arrive') return 'You have arrived';
  const direction = step.modifier ? `${step.modifier.replace('-', ' ')} ` : '';
  const action = step.type === 'depart' ? 'Head' : step.type === 'turn' ? 'Turn' : step.type === 'merge' ? 'Merge' : 'Continue';
  return `${action} ${direction}${step.name ? `onto ${step.name}` : ''}`.replace(/\s+/g, ' ').trim();
}

function formatStepDistance(meters?: number) {
  if (meters == null) return '';
  if (meters < 160) return `${Math.max(0, Math.round(meters * 3.28084 / 10) * 10)} ft`;
  return `${(meters * .000621371).toFixed(meters < 1609 ? 1 : 0)} mi`;
}

function spokenDestination(text: string) {
  return text.replace(/^\s*(?:hey\s+cubo[, ]*)?/i, '').replace(/^\s*(?:take me to|navigate to|directions to|find|search for|go to)\s+/i, '').trim().slice(0, 240);
}

export function MapScreen() {
  const windowSize = useWindowDimensions();
  const [{ width, height }, setSize] = useState({ width: windowSize.width, height: windowSize.height });
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { persistenceError, monitoringStatus } = useDrives();
  const focused = useIsFocused();
  const screenRoute = useRoute();
  const destinationParam = (screenRoute.params as { destination?: PlaceResult } | undefined)?.destination;
  const { remember, recent, home, work } = usePlaces();
  const gps = useDriveLocation(focused);
  const community = useRoadReports(gps.point, focused);
  const [hazardPrompt, setHazardPrompt] = useState<RoadReport | null>(null);
  const [promptDismissed, setPromptDismissed] = useState<Set<string>>(new Set());
  const closestReports = useRef(new Map<string, number>());
  const { activeSession, sessions, startDrive, addEvent, addRoutePoint, updateDrive, endDrive } = useDrives();
  const { beginDrive: beginAppBlocking, endDrive: endAppBlocking } = useAppBlocking();
  const { colors, mode } = useAppearance();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mapRef = useRef<MapHandle>(null);
  const lastHeading = useRef(0);
  const compassHeading = gps.point?.heading ?? null;
  const hasCentered = useRef(false);
  const searchInputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchMessage, setSearchMessage] = useState('');
  const { results: suggestions, setResults: setSuggestions, busy: suggesting, error: suggestionError } = usePlaceSuggestions(query, gps.point, focused && !searchResult);
  const [routing, setRouting] = useState(false);
  const [navigationRoute, setNavigationRoute] = useState<NavigationRoute | null>(null);
  const routeRequest = useRef<AbortController | null>(null);
  const automaticRouteRequest = useRef<AbortController | null>(null);
  const liveNavigation = useRef(new LiveNavigationTracker());
  const liveNavigationState = useRef({ tripId: activeSession?.id, point: gps.point, destination: searchResult, route: navigationRoute });
  liveNavigationState.current = { tripId: activeSession?.id, point: gps.point, destination: searchResult, route: navigationRoute };
  const arrivalVoiceState = useRef({ focused, active: !!activeSession });
  arrivalVoiceState.current = { focused, active: !!activeSession };
  const arrivalVoice = useRef<CuboAIVoice | null>(null);
  const arrivalEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishingDrive = useRef(false);
  const announcedReports = useRef(new Set<string>());
  const voiceRouteState = useRef({ tripId: activeSession?.id, point: gps.point ?? undefined, destination: searchResult, gpsValid: gps.hasFix && gps.status !== 'weak' });
  voiceRouteState.current = { tripId: activeSession?.id, point: gps.point ?? undefined, destination: searchResult, gpsValid: gps.hasFix && gps.status !== 'weak' };
  const [voiceRoutes] = useState(() => new VoiceRoutes(() => voiceRouteState.current, route => {
    setNavigationRoute(route); setStepIndex(0); setNavigating(true); setFollowing(true); liveNavigation.current.routeApplied(Date.now()); setNavigationNotice('updated'); setSearchMessage('Route updated · estimates exclude live traffic');
  }));
  const [navigating, setNavigating] = useState(!!activeSession);
  usePreventRemove(!!activeSession, () => {});
  const [pipHidden, setPipHidden] = useState(false);
  const [pipAtBottomRight, setPipAtBottomRight] = useState(false);
  const [finishedId, setFinishedId] = useState<string | null>(null);
  const [topCardBottom, setTopCardBottom] = useState(insets.top + 94);
  const pipCorner = useRef({ right: true, bottom: false });
  const [bottomCardHeight, setBottomCardHeight] = useState(164);
  const reducedMotion = useReducedMotion();
  const [idleSheetExpanded, setIdleSheetExpanded] = useState(true);
  const idleSheetProgress = useRef(new Animated.Value(1)).current;
  const idleSheetDragStart = useRef(1);
  const [driveSheetExpanded, setDriveSheetExpanded] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleMode>('street');
  const driveSheetProgress = useRef(new Animated.Value(0)).current;
  const driveSheetDragStart = useRef(0);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [mapVoiceOpen, setMapVoiceOpen] = useState(false); const [mapVoiceListening, setMapVoiceListening] = useState(false);
  const [mapVoiceConsent, setMapVoiceConsent] = useState(false); const [mapVoiceMessage, setMapVoiceMessage] = useState('Say where you want to go.');
  const [mapMicRecovery, setMapMicRecovery] = useState(false); const [mapMicRetrying, setMapMicRetrying] = useState(false); const [mapVoiceError, setMapVoiceError] = useState('');
  const mapVoice = useRef<CuboAIVoice | null>(null); const mapMicRecoveryShown = useRef(false); const mapVoiceApproved = useRef(false);
  const mapVoiceState = useRef({ focused, active: !!activeSession, open: mapVoiceOpen }); mapVoiceState.current = { focused, active: !!activeSession, open: mapVoiceOpen };
  const mapVoiceAllowed = () => mapVoiceState.current.focused && !mapVoiceState.current.active && mapVoiceState.current.open && !document.hidden;
  const [mapDroidVisible, setMapDroidVisible] = useState(() => { try { return user ? readMapDroidVisible(localStorage, user.uid) : false; } catch { return false; } });
  const idleSheetScrollY = useRef(0);
  useEffect(() => { setVoiceStatus(''); }, [activeSession?.id, focused]);
  useEffect(() => {
    mapVoice.current?.dispose();
    mapVoice.current = new CuboAIVoice(mapVoiceAllowed, () => user ? readVoicePreference(localStorage, user.uid) : '');
    return () => { mapVoice.current?.dispose(); mapVoice.current = null; };
  }, [user?.uid]);
  useEffect(() => {
    if (!activeSession && focused) return;
    mapVoice.current?.stop(); setMapVoiceOpen(false); setMapVoiceListening(false); setMapVoiceConsent(false); setMapMicRecovery(false);
  }, [activeSession?.id, focused]);
  useEffect(() => {
    if (!user) { setMapDroidVisible(false); return; }
    const sync = (event?: Event) => {
      const detail = (event as CustomEvent<{ uid?: string; visible?: boolean }> | undefined)?.detail;
      if (detail?.uid === user.uid && typeof detail.visible === 'boolean') setMapDroidVisible(detail.visible);
      else try { setMapDroidVisible(readMapDroidVisible(localStorage, user.uid)); } catch {}
    };
    sync(); window.addEventListener('storage', sync); window.addEventListener(MAP_DROID_VISIBILITY_EVENT, sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener(MAP_DROID_VISIBILITY_EVENT, sync); };
  }, [user?.uid]);
  const distanceBaseline = useRef(0);
  const [following, setFollowing] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [hazardMenu, setHazardMenu] = useState(false);
  const [hazardSaved, setHazardSaved] = useState<RoadHazardKind | null>(null);
  const [driveBlockPlan, setDriveBlockPlan] = useState<DriveBlockPlan | null>(null);
  const [navigationNotice, setNavigationNotice] = useState<'following' | 'rerouting' | 'updated' | 'arrived'>('following');
  const [arrivalCompleting, setArrivalCompleting] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pipPosition = useRef(new Animated.ValueXY({ x: Math.max(16, width - 128), y: 104 })).current;
  const pipOrigin = useRef({ x: Math.max(16, width - 128), y: 104 });
  const pipTop = topCardBottom + 12;
  const pipBottom = Math.max(pipTop, height - insets.bottom - 12 - bottomCardHeight - 12 - 148);
  const pipRight = Math.max(16, width - 128);
  const pipPan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 5,
    onPanResponderGrant: () => {
      pipPosition.stopAnimation((value) => { pipOrigin.current = { x: value.x, y: value.y }; });
    },
    onPanResponderMove: (_, gesture) => {
      pipPosition.setValue({ x: Math.max(16, Math.min(pipRight, pipOrigin.current.x + gesture.dx)), y: Math.max(pipTop, Math.min(pipBottom, pipOrigin.current.y + gesture.dy)) });
    },
    onPanResponderRelease: (_, gesture) => {
      const currentX = pipOrigin.current.x + gesture.dx;
      const currentY = pipOrigin.current.y + gesture.dy;
      const target = snapPipCorner(currentX, currentY, pipRight, pipTop, pipBottom);
      pipCorner.current = { right: target.x === pipRight, bottom: target.y === pipBottom };
      setPipAtBottomRight(target.x === pipRight && target.y === pipBottom);
      Animated.spring(pipPosition, { toValue: target, damping: 26, stiffness: 260, mass: .7, overshootClamping: true, useNativeDriver: false }).start();
    },
    onPanResponderTerminate: () => Animated.spring(pipPosition, { toValue: pipOrigin.current, damping: 26, stiffness: 260, overshootClamping: true, useNativeDriver: false }).start(),
  }), [height, pipBottom, pipTop, pipPosition, pipRight, width]);
  useEffect(() => {
    const target = { x: pipCorner.current.right ? pipRight : 16, y: pipCorner.current.bottom ? pipBottom : pipTop };
    Animated.spring(pipPosition, { toValue: target, damping: 26, stiffness: 260, overshootClamping: true, useNativeDriver: false }).start();
  }, [pipTop, pipBottom, pipRight, pipPosition]);
  const trip = activeSession;
  const hazards = trip?.events.filter((event) => event.type === 'road_hazard' && event.latitude != null && event.longitude != null) ?? [];
  const routeReports = useMemo(() => community.reports.filter((report) => !navigationRoute || distanceToRouteMeters(navigationRoute, report) < 75), [community.reports, navigationRoute]);
  const nearbyReport = activeSession && gps.point ? routeReports.filter((report) => report.reporterId !== community.userId && !community.confirmed.has(report.id) && !promptDismissed.has(report.id)).map((report) => ({ report, distance: distanceMeters(gps.point!, report) })).filter(({ report, distance }) => distance < 300 && isAhead(gps.point!, report)).sort((a, b) => a.distance - b.distance)[0] : undefined;
  const recordedRoute = trip?.route ?? [];
  const center = gps.point ?? recordedRoute[recordedRoute.length - 1] ?? fallbackRegion;
  const dismissSearchKeyboard = () => { setShowRecent(false); searchInputRef.current?.blur(); Keyboard.dismiss(); };
  const focusDriver = () => {
    if (!gps.point || !gps.hasFix) return;
    if (gps.point.heading != null && gps.speedMph >= 2) lastHeading.current = gps.point.heading;
    else if (compassHeading != null) lastHeading.current = compassHeading;
    const heading = lastHeading.current;
    mapRef.current?.animateCamera({ center: gps.point, heading: navigating ? heading : 0, pitch: navigating ? 54 : 0, zoom: navigating ? 17.7 : 16, altitude: navigating ? 500 : 1800 }, { duration: navigating ? 320 : 450 });
  };
  const recenter = () => { if (!gps.hasFix) { gps.retry(); return; } if (navigating) { setFollowing(true); focusDriver(); } else mapRef.current?.animateToRegion({ latitude: center.latitude, longitude: center.longitude, latitudeDelta: .015, longitudeDelta: .015 }, 450); };

  const buildRoute = async (destination: Coordinate) => {
    routeRequest.current?.abort();
    const controller = new AbortController();
    routeRequest.current = controller;
    const origin = gps.hasFix ? gps.point : null;
    if (!origin) { setSearchMessage('Destination selected. Enable location to calculate your route.'); return; }
    setRouting(true);
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    try {
      const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`, { signal: controller.signal });
      if (!response.ok) throw new Error('Routing service unavailable');
      const payload = await response.json();
      if (controller.signal.aborted) return;
      const route = parseDrivingRoute(payload);
      const line = route.coordinates;
      setNavigationRoute(route);
      setNavigating(false); setFollowing(true); setStepIndex(0);
      setSearchMessage(`${(route.distanceMeters * .000621371).toFixed(1)} mi · ${Math.max(1, Math.round(route.durationSeconds / 60))} min`);
      mapRef.current?.fitToCoordinates(line, { edgePadding: { top: 100, right: 45, bottom: bottomCardHeight + insets.bottom + (screenRoute.name === 'Map' ? 112 : 24), left: 45 }, animated: true });
    } catch { if (!controller.signal.aborted || timedOut) { setNavigationRoute(null); setSearchMessage(timedOut ? 'Routing timed out — tap the search arrow to retry' : 'Route unavailable — tap the search arrow to retry'); } }
    finally { clearTimeout(timeout); if (!controller.signal.aborted || timedOut) setRouting(false); }
  };

  const automaticallyReroute = async (sessionId: string, origin: Coordinate, destination: Coordinate) => {
    automaticRouteRequest.current?.abort();
    const controller = new AbortController();
    automaticRouteRequest.current = controller;
    setNavigationNotice('rerouting');
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`, { signal: controller.signal });
      if (!response.ok) throw Error('Routing service unavailable');
      const route = parseDrivingRoute(await response.json());
      const current = liveNavigationState.current;
      if (controller.signal.aborted || current.tripId !== sessionId || !current.destination || current.destination.latitude !== destination.latitude || current.destination.longitude !== destination.longitude) return;
      setNavigationRoute(route); setStepIndex(0); setNavigating(true); setFollowing(true);
      liveNavigation.current.routeApplied(Date.now());
      setNavigationNotice('updated');
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNavigationNotice('following'), 3200);
    } catch {
      if (!controller.signal.aborted) {
        setNavigationNotice('following');
        setSearchMessage('Could not recalculate yet · keeping your current route');
      }
    } finally {
      clearTimeout(timeout);
      if (automaticRouteRequest.current === controller) automaticRouteRequest.current = null;
    }
  };

  const search = async (requestedQuery?: string, fromVoice = false) => {
    const clean = (requestedQuery ?? query).trim(); if (!clean || searching || routing) return;
    if (requestedQuery != null) setQuery(clean);
    dismissSearchKeyboard();
    setSearching(true); setSearchMessage('');
    try {
      const [result] = await searchPlaces(clean, gps.point);
      if (!result) { setSearchMessage('No place found'); if (fromVoice) { setMapVoiceMessage(`I couldn't find ${clean}. Try a street address or place name.`); mapVoice.current?.speak(`I couldn't find ${clean}. Try a street address or place name.`); } return; }
      const destination = { latitude: result.latitude, longitude: result.longitude };
      remember(result); setQuery(result.title); setNavigationRoute(null); setSearchResult(destination); setSuggestions([]);
      if (fromVoice) { const reply = `Showing ${result.title} on the map.`; setMapVoiceMessage(reply); mapVoice.current?.speak(reply); }
      // The route effect runs after the destination and GPS are both ready.
    } catch { setSearchMessage('Search unavailable'); if (fromVoice) { setMapVoiceMessage('Map search is unavailable right now.'); mapVoice.current?.speak('Map search is unavailable right now.'); } } finally { setSearching(false); }
  };
  function closeMapVoice() { mapVoice.current?.stop(); setMapVoiceOpen(false); setMapVoiceListening(false); setMapVoiceConsent(false); setMapMicRecovery(false); }
  function openMapVoice() {
    if (mapVoiceOpen) { closeMapVoice(); return; }
    setMapVoiceOpen(true); setMapVoiceError(''); setMapVoiceMessage('Say where you want to go.');
  }
  function askMapVoice() {
    if (!mapVoiceOpen || activeSession) return;
    if (!mapVoiceApproved.current) { setMapVoiceConsent(true); return; }
    startMapListening();
  }
  function recoverMapMicrophone(message: string) {
    setMapVoiceListening(false);
    if (isRecoverableMicrophoneFailure(message) && !mapMicRecoveryShown.current) {
      mapMicRecoveryShown.current = true; setMapVoiceError(''); setMapMicRecovery(true); setMapVoiceMessage('Microphone access needs a quick check.');
    } else setMapVoiceError(message);
  }
  function startMapListening() {
    if (!mapVoiceAllowed() || !mapVoice.current) return;
    mapVoice.current.stop(); setMapVoiceConsent(false); setMapMicRecovery(false); setMapVoiceError(''); setMapVoiceListening(true); setMapVoiceMessage('Listening… say a destination.');
    try {
      mapVoice.current.listen(true, text => {
        if (!mapVoiceAllowed()) return;
        setMapVoiceListening(false);
        const destination = spokenDestination(text);
        if (!destination) { recoverMapMicrophone('Voice input stopped (no-speech). Check microphone access and try again.'); return; }
        setMapVoiceMessage(`Looking for ${destination}…`); void search(destination, true);
      }, recoverMapMicrophone, () => setMapVoiceListening(false));
    } catch (cause) { recoverMapMicrophone(cause instanceof Error ? cause.message : 'Voice recognition unavailable.'); }
  }
  async function enableMapMicrophoneAndRetry() {
    if (mapMicRetrying) return;
    setMapMicRetrying(true); setMapVoiceError('');
    try { await requestMediaAccess('microphone'); setMapMicRecovery(false); if (mapVoiceAllowed()) startMapListening(); }
    catch (cause) { setMapMicRecovery(false); setMapVoiceError(accessError(cause)); }
    finally { setMapMicRetrying(false); }
  }
  useEffect(() => { if (suggestionError) setSearchMessage(suggestionError); }, [suggestionError]);

  const chooseSuggestion = async (suggestion: PlaceSuggestion) => {
    dismissSearchKeyboard();
    remember(suggestion);
    const destination = { latitude: suggestion.latitude, longitude: suggestion.longitude };
    setQuery(suggestion.title); setSearchResult(destination); setNavigationRoute(null); setSuggestions([]); setSearchMessage(suggestion.subtitle || suggestion.title);
    // Keep the selection while GPS is requested; the route effect resumes it.
  };

  useEffect(() => {
    setRouting(false);
    if (searchResult && gps.hasFix && !navigationRoute) void buildRoute(searchResult);
    return () => { routeRequest.current?.abort(); };
  }, [gps.hasFix, searchResult]);

  const startNavigation = () => {
    if (activeSession) return;
    if (!gps.hasFix) { setSearchMessage('Enable location before starting your drive.'); gps.retry(); return; }
    if (!navigationRoute) return;
    dismissSearchKeyboard();
    distanceBaseline.current = gps.distanceMiles;
    liveNavigation.current.reset(); setNavigationNotice('following');
    startDrive(); setNavigating(true); setDriveBlockPlan(beginAppBlocking()); setFollowing(true); setStepIndex(0);
  };
  const loadedDestination = useRef<string | null>(null);
  useEffect(() => {
    if (!destinationParam || !gps.point || loadedDestination.current === destinationParam.id || activeSession) return;
    loadedDestination.current = destinationParam.id;
    void chooseSuggestion(destinationParam);
  }, [destinationParam?.id, gps.point?.timestamp]);

  const reportHazard = (kind: RoadHazardKind) => {
    const option = hazardOptions.find((item) => item.kind === kind)!;
    if (!gps.point || !gps.hasFix) { setSearchMessage('Waiting for GPS before placing your report.'); setHazardMenu(false); return; }
    void community.submit(kind, gps.point);
    addEvent({
      type: 'road_hazard',
      severity: kind === 'crash' ? 'warning' : 'info',
      title: `${option.label} submitted here`,
      detail: `${option.detail}. Saved at your current position.`,
      elapsedSeconds: activeSession?.durationSeconds ?? 0,
      speedMph: gps.speedMph,
      hazardDistanceMeters: 0,
      hazardKind: kind,
      latitude: gps.point?.latitude ?? center.latitude,
      longitude: gps.point?.longitude ?? center.longitude,
    });
    setHazardSaved(kind);
    setHazardMenu(false);
  };

  const finishDrive = () => {
    if (finishingDrive.current) return;
    finishingDrive.current = true;
    if (arrivalEndTimer.current) clearTimeout(arrivalEndTimer.current);
    arrivalEndTimer.current = null;
    automaticRouteRequest.current?.abort(); arrivalVoice.current?.stop();
    endAppBlocking(); setDriveBlockPlan(null);
    const completed = endDrive();
    if (completed) setFinishedId(completed.id);
    else finishingDrive.current = false;
  };

  useEffect(() => {
    if (finishedId && !activeSession) navigation.reset({ index: 1, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }, { name: 'TripSummary', params: { sessionId: finishedId } }] });
  }, [finishedId, activeSession, navigation]);

  useEffect(() => {
    arrivalVoice.current?.dispose();
    arrivalVoice.current = new CuboAIVoice(() => arrivalVoiceState.current.focused && arrivalVoiceState.current.active, () => {
      if (!user?.uid || typeof localStorage === 'undefined') return '';
      return readVoicePreference(localStorage, user.uid);
    });
    return () => { arrivalVoice.current?.dispose(); arrivalVoice.current = null; };
  }, [user?.uid]);

  useEffect(() => {
    liveNavigation.current.reset();
    setNavigationNotice('following');
    setArrivalCompleting(false);
    finishingDrive.current = false;
    announcedReports.current.clear();
    automaticRouteRequest.current?.abort();
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (arrivalEndTimer.current) clearTimeout(arrivalEndTimer.current);
    arrivalEndTimer.current = null;
    return () => { automaticRouteRequest.current?.abort(); if (noticeTimer.current) clearTimeout(noticeTimer.current); if (arrivalEndTimer.current) clearTimeout(arrivalEndTimer.current); };
  }, [activeSession?.id]);

  useEffect(() => {
    if (!activeSession || !gps.point || gps.status === 'weak') return;
    const previous = activeSession.route[activeSession.route.length - 1];
    if (previous && distanceMeters(previous, gps.point) < Math.max(5, gps.point.accuracy ?? 5)) return;
    addRoutePoint(gps.point.latitude, gps.point.longitude, gps.speedMph);
  }, [activeSession?.id, addRoutePoint, gps.point?.timestamp]);

  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(() => updateDrive({ durationSeconds: elapsedSeconds(activeSession.startedAt), focusScore: activeSession.focusScore, distanceMiles: Number(Math.max(0, gps.distanceMiles - distanceBaseline.current).toFixed(3)) }), 1000);
    return () => clearInterval(interval);
  }, [activeSession?.id, activeSession?.startedAt, gps.distanceMiles, updateDrive]);

  useEffect(() => {
    if (!gps.point || hasCentered.current || navigationRoute) return;
    hasCentered.current = true;
    focusDriver();
  }, [gps.point?.timestamp, navigationRoute]);

  useEffect(() => {
    if (!navigating || !gps.point || !navigationRoute) return;
    if (following) focusDriver();
    const nextStep = navigationRoute.steps[stepIndex];
    if (nextStep && distanceMeters(gps.point, nextStep.location) < 45 && stepIndex < navigationRoute.steps.length - 1) setStepIndex((current) => current + 1);
  }, [following, gps.point, compassHeading, navigating, navigationRoute, stepIndex]);

  useEffect(() => {
    if (!activeSession || !gps.point || !navigationRoute || !searchResult || gps.status === 'weak' || automaticRouteRequest.current || navigationNotice === 'arrived') return;
    const decision = liveNavigation.current.update(navigationRoute, gps.point, searchResult, Date.now());
    if (decision.kind === 'reroute') {
      void automaticallyReroute(activeSession.id, gps.point, searchResult);
    } else if (decision.kind === 'arrived') {
      setNavigationNotice('arrived'); setFollowing(true);
      setStepIndex(Math.max(0, navigationRoute.steps.length - 1));
      setArrivalCompleting(true);
      setSearchMessage(`Arrived at ${query || 'your destination'} · saving your drive`);
      try { if (!window.speechSynthesis.speaking) arrivalVoice.current?.speak(`Arrived at ${query || 'your destination'}.`, undefined, () => {}); } catch { /* The visual arrival state remains available. */ }
      arrivalEndTimer.current = setTimeout(finishDrive, 1000);
    }
  }, [activeSession?.id, gps.point?.timestamp, gps.status, navigationRoute, searchResult, navigationNotice, query]);

  useEffect(() => {
    if (!activeSession || !nearbyReport || announcedReports.current.has(nearbyReport.report.id)) return;
    announcedReports.current.add(nearbyReport.report.id);
    const label = nearbyReport.report.kind === 'object' ? 'Object' : nearbyReport.report.kind === 'police' ? 'Police activity' : 'Crash';
    const distance = Math.max(10, Math.round(nearbyReport.distance / 10) * 10);
    const message = `${label} reported ahead in ${distance} meters.`;
    setVoiceStatus(message);
    try { if (!window.speechSynthesis.speaking) arrivalVoice.current?.speak(message, undefined, () => {}); } catch { /* Keep the visible alert if speech is unavailable. */ }
  }, [activeSession?.id, nearbyReport?.report.id]);

  useEffect(() => {
    if (!activeSession || !gps.point || hazardPrompt) return;
    for (const report of routeReports) {
      if (report.reporterId === community.userId || community.confirmed.has(report.id) || promptDismissed.has(report.id)) continue;
      const distance = distanceMeters(gps.point, report);
      if (!isAhead(gps.point, report)) continue;
      const closest = Math.min(closestReports.current.get(report.id) ?? Infinity, distance);
      closestReports.current.set(report.id, closest);
      if (distance < 55 || (closest < 65 && distance > closest + 15 && distance < 180)) { setHazardPrompt(report); break; }
    }
  }, [gps.point?.timestamp, activeSession?.id, routeReports, community.confirmed, promptDismissed, hazardPrompt]);
  useEffect(() => {
    if (!hazardPrompt) return;
    const reportId = hazardPrompt.id;
    const timer = setTimeout(() => { setPromptDismissed(value => new Set([...value, reportId])); setHazardPrompt(null); }, SURVEY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hazardPrompt?.id]);
  useEffect(() => {
    if (hazardPrompt && !community.reports.some(report => report.id === hazardPrompt.id)) setHazardPrompt(null);
  }, [community.reports, hazardPrompt]);
  const currentStep = navigationNotice === 'arrived' ? navigationRoute?.steps[navigationRoute.steps.length - 1] : navigationRoute?.steps[stepIndex];
  const voiceRoute = useMemo(() => remainingRoute(navigationRoute, gps.point), [navigationRoute, gps.point]);
  const voiceInstructions = useMemo(() => navigationRoute?.steps.slice(stepIndex).map(stepInstruction), [navigationRoute, stepIndex]);

  const compactMap = height < 680;
  const idleSheetMaxHeight = Math.max(100, height - insets.top - insets.bottom - (screenRoute.name === 'Map' ? 100 : 12) - 190);
  const idleSheetCollapsedHeight = 96;
  const idleSheetTravel = Math.max(1, idleSheetMaxHeight - idleSheetCollapsedHeight);
  const idleSheetPan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => !activeSession && Math.abs(gesture.dy) > Math.abs(gesture.dx) && Math.abs(gesture.dy) > 5 && (!idleSheetExpanded || (gesture.dy > 0 && idleSheetScrollY.current <= 1)),
    onMoveShouldSetPanResponderCapture: (_, gesture) => !activeSession && Math.abs(gesture.dy) > Math.abs(gesture.dx) && Math.abs(gesture.dy) > 7 && (!idleSheetExpanded || (gesture.dy > 0 && idleSheetScrollY.current <= 1)),
    onPanResponderGrant: () => idleSheetProgress.stopAnimation(value => { idleSheetDragStart.current = value; }),
    onPanResponderMove: (_, gesture) => idleSheetProgress.setValue(Math.max(0, Math.min(1, idleSheetDragStart.current - gesture.dy / idleSheetTravel))),
    onPanResponderRelease: (_, gesture) => {
      const resting = Math.max(0, Math.min(1, idleSheetDragStart.current - gesture.dy / idleSheetTravel));
      const expanded = gesture.vy < -.3 ? true : gesture.vy > .3 ? false : resting >= .5;
      setIdleSheetExpanded(expanded);
      Animated.spring(idleSheetProgress, { toValue: expanded ? 1 : 0, damping: 28, stiffness: 310, mass: .78, overshootClamping: true, useNativeDriver: false }).start();
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => Animated.spring(idleSheetProgress, { toValue: idleSheetExpanded ? 1 : 0, damping: 28, stiffness: 310, mass: .78, overshootClamping: true, useNativeDriver: false }).start(),
  }), [activeSession, idleSheetExpanded, idleSheetProgress, idleSheetTravel]);
  useEffect(() => {
    const animation = reducedMotion
      ? Animated.timing(idleSheetProgress, { toValue: idleSheetExpanded ? 1 : 0, duration: 0, useNativeDriver: false })
      : Animated.spring(idleSheetProgress, { toValue: idleSheetExpanded ? 1 : 0, damping: 30, stiffness: 290, mass: .8, overshootClamping: true, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [idleSheetExpanded, idleSheetProgress, reducedMotion]);
  useEffect(() => { if (navigationRoute || searchFocused) setIdleSheetExpanded(true); }, [navigationRoute, searchFocused]);
  const sheetContent = (children: React.ReactNode) => activeSession ? children : <ScrollView scrollEnabled={idleSheetExpanded} onScroll={event => { idleSheetScrollY.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator>{children}</ScrollView>;
  const idleSheetExpandedStyle = { maxHeight: idleSheetMaxHeight };
  const idleSheetAnimatedStyle = !activeSession ? { maxHeight: idleSheetProgress.interpolate({ inputRange: [0, 1], outputRange: [idleSheetCollapsedHeight, idleSheetExpandedStyle.maxHeight] }) } : undefined;
  const driveSheetCollapsedHeight = 112;
  const driveSheetPreferredHeight = hazardPrompt || nearbyReport
    ? Math.max(322, height * .4)
    : !gps.hasFix
      ? Math.max(286, height * .35)
      : Math.max(238, height * .31);
  const driveSheetExpandedHeight = Math.min(
    driveSheetPreferredHeight,
    Math.max(driveSheetCollapsedHeight, height - insets.top - insets.bottom - topCardBottom - 28),
  );
  const driveSheetTravel = Math.max(1, driveSheetExpandedHeight - driveSheetCollapsedHeight);
  const driveSheetPan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => !!activeSession && Math.abs(gesture.dy) > Math.abs(gesture.dx) && Math.abs(gesture.dy) > 5,
    onMoveShouldSetPanResponderCapture: (_, gesture) => !!activeSession && Math.abs(gesture.dy) > Math.abs(gesture.dx) && Math.abs(gesture.dy) > 7,
    onPanResponderGrant: () => driveSheetProgress.stopAnimation(value => { driveSheetDragStart.current = value; }),
    onPanResponderMove: (_, gesture) => driveSheetProgress.setValue(Math.max(0, Math.min(1, driveSheetDragStart.current - gesture.dy / driveSheetTravel))),
    onPanResponderRelease: (_, gesture) => {
      const resting = Math.max(0, Math.min(1, driveSheetDragStart.current - gesture.dy / driveSheetTravel));
      setDriveSheetExpanded(gesture.vy < -.3 ? true : gesture.vy > .3 ? false : resting >= .5);
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => Animated.spring(driveSheetProgress, { toValue: driveSheetExpanded ? 1 : 0, damping: 30, stiffness: 300, mass: .78, overshootClamping: true, useNativeDriver: false }).start(),
  }), [activeSession, driveSheetExpanded, driveSheetProgress, driveSheetTravel]);
  useEffect(() => {
    const animation = reducedMotion
      ? Animated.timing(driveSheetProgress, { toValue: driveSheetExpanded ? 1 : 0, duration: 0, useNativeDriver: false })
      : Animated.spring(driveSheetProgress, { toValue: driveSheetExpanded ? 1 : 0, damping: 30, stiffness: 300, mass: .78, overshootClamping: true, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [driveSheetExpanded, driveSheetProgress, reducedMotion]);
  useEffect(() => {
    setDriveSheetExpanded(false);
    driveSheetProgress.setValue(0);
  }, [activeSession?.id, driveSheetProgress]);
  useEffect(() => {
    if (activeSession && (hazardPrompt || nearbyReport || arrivalCompleting || !gps.hasFix)) setDriveSheetExpanded(true);
  }, [activeSession?.id, hazardPrompt?.id, nearbyReport?.report.id, arrivalCompleting, gps.hasFix]);
  const driveSheetAnimatedStyle = activeSession ? { height: driveSheetProgress.interpolate({ inputRange: [0, 1], outputRange: [driveSheetCollapsedHeight, driveSheetExpandedHeight] }) } : undefined;
  const driveDetailsAnimatedStyle = { opacity: driveSheetProgress, transform: [{ translateY: driveSheetProgress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] };
  const leaveMap = () => {
    dismissSearchKeyboard(); closeMapVoice();
    if (screenRoute.name === 'Map') navigation.navigate('MainTabs', { screen: 'Home' });
    else if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs', { screen: 'Home' });
  };

  return <View style={styles.root} onLayout={event => { const { width, height } = event.nativeEvent.layout; setSize({ width, height }); }}>
    <MapView ref={mapRef} style={[StyleSheet.absoluteFill, { zIndex: 0 }]} initialRegion={fallbackRegion} attributionBottom={bottomCardHeight + insets.bottom + (!activeSession && screenRoute.name === 'Map' ? 112 : 24)} mapStyle={mapStyle} userLocation={gps.hasFix ? gps.point : null} showsUserLocation={gps.hasFix && !navigating} showsMyLocationButton={false} showsCompass={false} toolbarEnabled={false} userInterfaceStyle={mode} onPress={dismissSearchKeyboard} onPanDrag={() => { dismissSearchKeyboard(); if (navigating) setFollowing(false); }}>
      {navigationRoute ? <><Polyline coordinates={navigationRoute.coordinates} strokeColor="rgba(255,255,255,.9)" strokeWidth={11} lineCap="round" lineJoin="round" /><Polyline coordinates={navigationRoute.coordinates} strokeColor={colors.accent} strokeWidth={7} lineCap="round" lineJoin="round" /></> : null}
      {navigating && gps.point ? <Marker coordinate={gps.point} anchor={{ x: .5, y: .5 }} flat rotation={gps.point.heading ?? lastHeading.current}><View style={styles.driverMarker}><Ionicons name="arrow-up" size={20} color="#FFFFFF" /></View></Marker> : null}
      {searchResult ? <Marker coordinate={searchResult} anchor={{ x: .5, y: 1 }} title={query.trim() || 'Destination'}><View style={styles.destinationPin}><Ionicons name="location-sharp" size={36} color={colors.danger} /><View style={styles.destinationPinCenter} /></View></Marker> : null}
      {routeReports.filter((report) => report.reporterId !== community.userId).map((report) => { const meta = hazardMeta[report.kind]; return <Marker key={report.id} coordinate={report} title={`${report.kind[0].toUpperCase()}${report.kind.slice(1)} reported here`} description="Community road report"><View style={[styles.hazardPin, { backgroundColor: meta.color }]}><Ionicons name={meta.icon} size={16} color="#FFFFFF" /></View></Marker>; })}
      {hazards.map((hazard) => { const meta = hazardMeta[hazard.hazardKind ?? 'object']; return <Marker key={hazard.id} coordinate={{ latitude: hazard.latitude!, longitude: hazard.longitude! }} title={hazard.title} description={hazard.detail}><View style={[styles.hazardPin, { backgroundColor: meta.color }]}><Ionicons name={meta.icon} size={16} color="#fff" /></View></Marker>; })}
    </MapView>
    <SafeAreaView edges={['top', 'bottom']} style={[styles.overlay, !activeSession && screenRoute.name === 'Map' && { paddingBottom: 100 }, activeSession && styles.overlayDrive]} pointerEvents="box-none">
      {!activeSession && <MotionPressable accessibilityLabel="Back from Map" style={styles.mapBack} onPress={leaveMap}><Ionicons name="arrow-back" size={22} color={colors.text} /></MotionPressable>}
      {!activeSession && <MotionPressable accessibilityRole="switch" accessibilityLabel="Satellite view" accessibilityState={{ checked: mapStyle === 'satellite' }} style={[styles.mapStyleToggle, mapStyle === 'satellite' && styles.mapStyleToggleActive]} scaleTo={0.92} onPress={() => setMapStyle(value => value === 'street' ? 'satellite' : 'street')}><Ionicons name={mapStyle === 'satellite' ? 'map-outline' : 'layers-outline'} size={21} color={mapStyle === 'satellite' ? colors.onAccent : colors.text} /></MotionPressable>}
      {!activeSession && <View style={styles.mapUtilities}><MotionPressable accessibilityLabel="Notifications" style={styles.utilityButton} onPress={() => navigation.navigate('Notifications')}><Ionicons name="notifications-outline" size={22} color={colors.text} /></MotionPressable><MotionPressable accessibilityLabel="Your account" style={styles.utilityButton} onPress={() => navigation.navigate('MainTabs', { screen: 'Account' })}><ProfileAvatar avatarId={profile.avatarId} photoUri={profile.photoUri} uid={user?.uid} size={44} rounded /></MotionPressable>{compactMap && <><MotionPressable accessibilityLabel={mapVoiceOpen ? 'Close Map Voice Assist' : 'Open Map Voice Assist'} accessibilityState={{ expanded: mapVoiceOpen }} style={[styles.utilityButton, mapVoiceOpen && styles.voiceButtonActive]} onPress={openMapVoice}><VoiceAssistIcon size={25} color={mapVoiceOpen ? colors.onAccent : colors.accent} /></MotionPressable><MotionPressable accessibilityLabel="Follow my location" style={styles.utilityButton} onPress={() => { dismissSearchKeyboard(); recenter(); }}><Ionicons name="locate" size={21} color={colors.text} /></MotionPressable></>}</View>}
      {!activeSession && !compactMap && <MotionPressable accessibilityLabel={mapVoiceOpen ? 'Close Map Voice Assist' : 'Open Map Voice Assist'} accessibilityState={{ expanded: mapVoiceOpen }} style={[styles.recenter, mapVoiceOpen && styles.voiceButtonActive, { bottom: bottomCardHeight + insets.bottom + (screenRoute.name === 'Map' ? 168 : 80) }]} onPress={openMapVoice}><VoiceAssistIcon size={25} color={mapVoiceOpen ? colors.onAccent : colors.accent} /></MotionPressable>}
      {!activeSession && mapVoiceOpen ? <View style={styles.mapVoiceCard}><View style={styles.mapVoiceTop}><View style={[styles.mapVoiceIcon, mapVoiceListening && styles.mapVoiceIconListening]}><VoiceAssistIcon size={24} color={colors.onAccent} /></View><View style={styles.fill}><Text style={styles.mapVoiceTitle}>Cubo Voice Assist</Text><Text accessibilityLiveRegion="polite" style={styles.mapVoiceBody}>{mapVoiceMessage}</Text></View><Pressable accessibilityLabel="Close Map Voice Assist" style={styles.mapVoiceClose} onPress={closeMapVoice}><Ionicons name="close" size={18} color={colors.textSecondary} /></Pressable></View>{mapVoiceError ? <Text accessibilityRole="alert" style={styles.mapVoiceError}>{mapVoiceError}</Text> : null}<MotionPressable style={[styles.mapVoiceAction, mapVoiceListening && styles.mapVoiceActionListening]} onPress={mapVoiceListening ? () => { mapVoice.current?.stop(); setMapVoiceListening(false); setMapVoiceMessage('Listening stopped.'); } : askMapVoice}><Ionicons name={mapVoiceListening ? 'stop' : 'mic'} size={18} color={colors.onAccent} /><Text style={styles.mapVoiceActionText}>{mapVoiceListening ? 'Stop listening' : 'Speak a destination'}</Text></MotionPressable></View> : null}
      {!activeSession && mapDroidVisible ? <View pointerEvents="none" style={[styles.mapDroid, { bottom: bottomCardHeight + insets.bottom + (screenRoute.name === 'Map' ? 116 : 28) }]}><View style={styles.mapDroidGlow} /><Image source={require('../../assets/assistant/cubo-droid.png')} resizeMode="contain" style={styles.mapDroidImage} /></View> : null}
      {activeSession ? <View style={[styles.guidanceCard, navigationNotice === 'arrived' && styles.guidanceArrived]} onLayout={event => setTopCardBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}><View style={[styles.maneuverIcon, navigationNotice === 'arrived' && styles.maneuverArrived]}><Ionicons name={navigationNotice === 'arrived' || currentStep?.type === 'arrive' ? 'flag' : currentStep?.modifier?.includes('left') ? 'arrow-back' : currentStep?.modifier?.includes('right') ? 'arrow-forward' : 'arrow-up'} size={25} color={colors.onAccent} /></View><View style={styles.fill}><Text accessibilityLiveRegion="polite" style={styles.stepDistance}>{navigationNotice === 'rerouting' ? 'RECALCULATING ROUTE' : navigationNotice === 'updated' ? 'NEW ROUTE READY' : navigationNotice === 'arrived' ? 'DESTINATION REACHED' : formatStepDistance(gps.point && currentStep ? distanceMeters(gps.point, currentStep.location) : currentStep?.distanceMeters)}</Text><Text numberOfLines={2} style={styles.instruction}>{navigationNotice === 'rerouting' ? 'Finding the best way back…' : navigationNotice === 'arrived' ? `Arrived at ${query || 'your destination'}` : stepInstruction(currentStep)}</Text></View><Pressable accessibilityLabel={pipHidden ? 'Show camera' : 'Hide camera'} onPress={() => setPipHidden((value) => !value)} style={styles.closeNavigation}><Ionicons name={pipHidden ? 'videocam-outline' : 'videocam-off-outline'} size={19} color={colors.accent} /></Pressable></View> : null}
      {activeSession && focused ? <Animated.View pointerEvents={pipHidden ? 'none' : 'auto'} style={[styles.cameraPip, { opacity: pipHidden ? 0 : 1, transform: pipPosition.getTranslateTransform() }]} {...pipPan.panHandlers}><Pressable accessibilityLabel="Drag camera to a corner" style={StyleSheet.absoluteFill} onPress={() => setPipHidden(true)}><DriveAttentionCamera speedMph={gps.speedMph} gpsValid={gps.speedAvailable} /><View pointerEvents="none" style={styles.pipShade} /><View style={styles.pipLabel}><View style={styles.pipDot} /><Text style={styles.pipText}>DRAG TO A CORNER</Text></View><Pressable accessibilityLabel="Hide camera" onPress={() => setPipHidden(true)} style={{ position: 'absolute', right: 4, top: 4, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.45)', borderRadius: 12 }}><Ionicons name="remove" size={20} color="#FFFFFF" /></Pressable></Pressable></Animated.View> : null}

      {(activeSession || !compactMap) && <MotionPressable accessibilityLabel="Follow my location" accessibilityState={{ selected: !!activeSession && following }} style={[styles.recenter, !activeSession && { bottom: bottomCardHeight + insets.bottom + (screenRoute.name === 'Map' ? 112 : 24) }, activeSession && following && styles.recenterActive, activeSession && { bottom: bottomCardHeight + insets.bottom + 26, right: pipAtBottomRight && !pipHidden ? undefined : 16, left: pipAtBottomRight && !pipHidden ? 16 : undefined }]} scaleTo={0.9} onPress={() => { dismissSearchKeyboard(); recenter(); }}><Ionicons name="locate" size={21} color={activeSession && following ? colors.onAccent : colors.text} /></MotionPressable>}
      <Animated.View style={[styles.bottomCard, activeSession && styles.bottomCardDrive, !activeSession && styles.bottomCardIdle, idleSheetAnimatedStyle, driveSheetAnimatedStyle]} onLayout={(event) => setBottomCardHeight(event.nativeEvent.layout.height)} {...(activeSession ? driveSheetPan.panHandlers : idleSheetPan.panHandlers)}>
        {sheetContent(<>
          {activeSession ? <>
            <Pressable accessibilityRole="button" accessibilityLabel={driveSheetExpanded ? 'Swipe down or tap to collapse drive controls' : 'Swipe up or tap to expand drive controls'} onPress={() => setDriveSheetExpanded(value => !value)} style={styles.grabberTouch} />
            <View style={styles.grabber} />
            <View style={styles.compactDriveRow}>
              <MotionPressable accessibilityLabel="End drive" style={[styles.endDrive, styles.endDriveCompact]} scaleTo={0.95} onPress={finishDrive}><Ionicons name="stop-circle" size={18} color="#FFFFFF" /><Text style={styles.endDriveText}>End drive</Text></MotionPressable>
              <View style={styles.compactMetrics}>
                <View style={styles.compactMetric}><Text style={styles.compactMetricValue}>{gps.speedAvailable ? gps.speedMph : '—'}</Text><Text style={styles.compactMetricLabel}>mph</Text></View>
                <View style={styles.compactMetric}><Text style={styles.compactMetricValue}>{Math.floor(activeSession.durationSeconds / 60)}:{String(activeSession.durationSeconds % 60).padStart(2, '0')}</Text><Text style={styles.compactMetricLabel}>drive</Text></View>
                <View style={styles.compactMetric}><Text style={styles.compactMetricValue}>{voiceRoute ? Math.max(0, Math.ceil(voiceRoute.seconds / 60)) : '—'}</Text><Text style={styles.compactMetricLabel}>min left</Text></View>
              </View>
            </View>
            <Animated.View pointerEvents={driveSheetExpanded ? 'auto' : 'none'} style={[styles.driveExpandedContent, driveDetailsAnimatedStyle]}>
              {!gps.hasFix && <Pressable accessibilityRole="button" onPress={gps.retry} style={styles.driveLocationNotice}><Text style={styles.driveLocationTitle}>Enable location</Text><Text style={styles.driveLocationBody}>{gps.error || 'Waiting for a fresh GPS fix. Allow location access for this website.'}</Text></Pressable>}
              {(hazardPrompt || nearbyReport) ? <View style={styles.driveHazardNotice}><Text style={styles.driveHazardText}>{hazardPrompt ? 'Do you still see this ' + hazardPrompt.kind + '?' : `${nearbyReport!.report.kind[0].toUpperCase()}${nearbyReport!.report.kind.slice(1)} reported ahead · ${Math.round(nearbyReport!.distance)} m`}</Text>{hazardPrompt ? <View style={styles.driveHazardActions}>{[true, false].map((present) => <Pressable key={String(present)} style={[styles.driveHazardChoice, present && { backgroundColor: colors.accentSoft }]} onPress={() => { void community.confirm(hazardPrompt, present).then((sent) => { if (sent) { setPromptDismissed(value => new Set([...value, hazardPrompt.id])); setHazardPrompt(null); } }); }}><Text style={{ color: colors.text }}>{present ? 'Still there' : 'Gone'}</Text></Pressable>)}<Pressable accessibilityLabel="Dismiss confirmation" style={styles.driveHazardDismiss} onPress={() => { setPromptDismissed((value) => new Set([...value, hazardPrompt.id])); setHazardPrompt(null); }}><Ionicons name="close" size={20} color={colors.textSecondary} /></Pressable></View> : <Pressable accessibilityLabel="Dismiss hazard alert" style={styles.driveHazardClose} onPress={() => setPromptDismissed((value) => new Set([...value, nearbyReport!.report.id]))}><Ionicons name="close" size={18} color={colors.textSecondary} /></Pressable>}</View> : null}
              <View style={styles.monitoringRow}><View style={[styles.monitoringDot, persistenceError && styles.monitoringDotError]} /><Text accessibilityLiveRegion="polite" style={styles.monitoringText}>{persistenceError ?? monitoringStatus}</Text></View>
              <View style={styles.driveControls}>
                <DriveVoiceControl onReroute={(choice, signal) => voiceRoutes.run(choice, signal)} live={{ point: gps.point ?? undefined, gpsValid: gps.hasFix && gps.status !== 'weak', speed: gps.speedAvailable ? gps.speedMph : undefined, nextTurn: currentStep ? stepInstruction(currentStep) : undefined, destination: navigationRoute ? query : undefined, routeSteps: voiceInstructions, routeIndex: stepIndex, routeId: navigationRoute ? `${query}:${navigationRoute.durationSeconds}:${navigationRoute.coordinates.length}` : undefined, remainingSeconds: voiceRoute?.seconds, remainingMiles: voiceRoute?.miles }} onStatus={setVoiceStatus} />
                <MotionPressable accessibilityLabel={hazardSaved ? 'Hazard saved. Report another hazard' : 'Report hazard'} style={styles.reportHazard} scaleTo={0.95} onPress={() => setHazardMenu(true)}><Ionicons name={hazardSaved ? 'checkmark-circle' : 'megaphone-outline'} size={20} color={colors.accent} /></MotionPressable>
              </View>
              {voiceStatus ? <Text numberOfLines={2} style={styles.voiceStatus}>{voiceStatus}</Text> : null}
              <Text accessibilityLiveRegion="polite" style={styles.privacy}>{arrivalCompleting ? 'Arrival confirmed · saving your drive…' : `${following ? 'Following your location' : 'Map unlocked'} · Tap locate to recenter`}</Text>
            </Animated.View>
          </> : <>
            <Pressable accessibilityRole="button" accessibilityLabel={idleSheetExpanded ? 'Swipe down or tap to collapse destination panel' : 'Swipe up or tap to expand destination panel'} onPress={() => setIdleSheetExpanded(value => !value)} style={styles.grabberTouch} />
            <View style={styles.grabber} />
            <View style={styles.topCard}><View style={styles.searchRow}><Ionicons name="search" size={19} color={colors.textSecondary} /><TextInput ref={searchInputRef} value={query} onFocus={() => { setSearchFocused(true); setShowRecent(!query.trim() || !!searchResult); }} onBlur={() => setSearchFocused(false)} onChangeText={(value) => { setShowRecent(!value.trim()); setQuery(value); setSearchResult(null); setNavigationRoute(null); setSearchMessage(''); }} onSubmitEditing={() => void search()} returnKeyType="search" placeholder="Where are you going?" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />{query ? <Pressable accessibilityLabel="Clear search" onPress={() => { setQuery(''); setSearchResult(null); setNavigationRoute(null); setSearchMessage(''); setSuggestions([]); }} style={styles.inputAction}><Ionicons name="close-circle" size={19} color={colors.textTertiary} /></Pressable> : null}{searchFocused ? <Pressable accessibilityLabel="Hide keyboard" onPress={dismissSearchKeyboard} style={styles.inputAction}><Ionicons name="chevron-down" size={18} color={colors.textSecondary} /></Pressable> : null}<Pressable disabled={!query.trim() || searching || routing} onPress={() => void search()} style={[styles.searchButton, (!query.trim() || searching || routing) && styles.searchDisabled]}><Ionicons name={searching || suggesting || routing ? 'hourglass-outline' : 'arrow-forward'} size={15} color={colors.onAccent} /></Pressable></View>{searching || routing ? <View style={styles.searchStatus}><View style={styles.statusDot} /><Text style={styles.statusText}>{routing ? 'Building your route…' : 'Finding that place…'}</Text></View> : null}{showRecent && <RecentDestinations places={recent} onSelect={place => { setShowRecent(false); void chooseSuggestion(place); }} />}{!showRecent && suggestions.length ? <ScrollView style={[styles.suggestions, { maxHeight: Math.min(220, height * .28) }]} keyboardShouldPersistTaps="always" nestedScrollEnabled>{suggestions.map((suggestion, index) => <Pressable key={suggestion.id} onPress={() => void chooseSuggestion(suggestion)} style={[styles.suggestion, index === suggestions.length - 1 && styles.suggestionLast]}><View style={styles.suggestionIcon}><Ionicons name="location" size={17} color={colors.accent} /></View><View style={styles.fill}><Text numberOfLines={1} style={styles.suggestionTitle}>{suggestion.title}</Text><Text numberOfLines={2} style={styles.suggestionSubtitle}>{suggestion.subtitle || 'Tap to view this location'}</Text></View><Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /></Pressable>)}</ScrollView> : null}</View>
            {!query.trim() && !suggestions.length && (!showRecent || !recent.length) && <View style={styles.savedPlaces}>
              {([{ kind: 'home', title: 'Home', icon: 'home-outline', place: home }, { kind: 'work', title: 'Work', icon: 'briefcase-outline', place: work }] as const).map(item => <MotionPressable key={item.kind} style={styles.savedRow} onPress={() => item.place ? void chooseSuggestion(item.place) : navigation.navigate('SavedPlace', { kind: item.kind })}><Ionicons name={item.icon} size={23} color={colors.accent} /><View style={styles.fill}><Text style={styles.suggestionTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.suggestionSubtitle}>{item.place?.title || 'Set address'}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.textTertiary} /></MotionPressable>)}
              {!showRecent && recent.slice(0, 1).map(place => <MotionPressable key={place.id} style={styles.savedRow} onPress={() => void chooseSuggestion(place)}><Ionicons name="time-outline" size={23} color={colors.textSecondary} /><View style={styles.fill}><Text numberOfLines={1} style={styles.suggestionTitle}>{place.title}</Text><Text numberOfLines={1} style={styles.suggestionSubtitle}>{place.subtitle || 'Recent destination'}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.textTertiary} /></MotionPressable>)}
            </View>}
            {!gps.hasFix && <Pressable accessibilityRole="button" onPress={gps.retry} style={styles.driveLocationNotice}><Text style={styles.driveLocationTitle}>Enable location</Text><Text style={styles.driveLocationBody}>{gps.error || 'Waiting for a fresh GPS fix. Allow location access for this website.'}</Text></Pressable>}
            {navigationRoute && <><View style={styles.tripRow}><View><Text style={styles.eyebrow}>ROUTE READY</Text><Text style={styles.cardTitle}>{(navigationRoute.distanceMeters * .000621371).toFixed(1)} mi</Text></View><View style={styles.stats}><View style={styles.statBlock}><Text style={styles.statValue}>{Math.max(1, Math.round(navigationRoute.durationSeconds / 60))}</Text><Text style={styles.statLabel}>min ETA</Text></View><View style={styles.statBlock}><Text style={styles.statValue}>{hazards.length}</Text><Text style={styles.statLabel}>Hazards</Text></View></View></View><MotionPressable onPress={startNavigation} style={styles.startRoute} scaleTo={0.96}><Ionicons name="navigate" size={17} color={colors.onAccent} /><Text style={styles.startRouteText}>Start drive</Text></MotionPressable></>}
            {!navigationRoute ? <View accessibilityState={{ disabled: true }} style={[styles.startRoute, { backgroundColor: colors.surfaceMuted }]}><Text style={{ color: colors.textSecondary, fontFamily: 'Manrope_700Bold', fontSize: 16 }}>Start drive</Text></View> : null}
            <Text accessibilityLiveRegion="polite" style={styles.privacy}>{community.error || searchMessage || (navigationRoute ? 'Preview the route, then start when you are ready.' : 'Choose a destination, then press Start drive.')}</Text>
          </>}
        </>)}
      </Animated.View>
    </SafeAreaView>
    <Modal visible={mapVoiceConsent} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => setMapVoiceConsent(false)}><View style={styles.voiceScrim}><View accessibilityViewIsModal style={styles.voiceDialog}><View style={styles.voiceDialogHero}><VoiceAssistIcon size={30} color={colors.onAccent} /></View><Text style={styles.voiceDialogEyebrow}>MAP VOICE ASSIST</Text><Text style={styles.voiceDialogTitle}>Speak without leaving Map</Text><Text style={styles.voiceDialogBody}>Say a place or address and CUBO will search it here. Your browser may process speech online; CUBO does not save raw audio.</Text><MotionPressable style={styles.voiceDialogPrimary} onPress={() => { mapVoiceApproved.current = true; setMapVoiceConsent(false); requestAnimationFrame(startMapListening); }}><Text style={styles.voiceDialogPrimaryText}>Start listening</Text></MotionPressable><Pressable style={styles.voiceDialogSecondary} onPress={() => setMapVoiceConsent(false)}><Text style={styles.voiceDialogSecondaryText}>Not now</Text></Pressable></View></View></Modal>
    <Modal visible={mapMicRecovery} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => setMapMicRecovery(false)}><View style={styles.voiceScrim}><View accessibilityViewIsModal style={styles.voiceDialog}><View style={styles.voiceDialogHero}><Ionicons name="mic-outline" size={30} color={colors.onAccent} /></View><Text style={styles.voiceDialogEyebrow}>MICROPHONE CHECK</Text><Text style={styles.voiceDialogTitle}>Enable your microphone</Text><Text style={styles.voiceDialogBody}>CUBO did not detect usable audio. Open the browser permission prompt, then Map Voice Assist will retry once.</Text><MotionPressable style={styles.voiceDialogPrimary} disabled={mapMicRetrying} onPress={() => void enableMapMicrophoneAndRetry()}><Text style={styles.voiceDialogPrimaryText}>{mapMicRetrying ? 'Checking microphone…' : 'Enable microphone & retry'}</Text></MotionPressable><Pressable disabled={mapMicRetrying} style={styles.voiceDialogSecondary} onPress={() => setMapMicRecovery(false)}><Text style={styles.voiceDialogSecondaryText}>Not now</Text></Pressable></View></View></Modal>
    {hazardMenu ? <><Pressable style={styles.sheetBackdrop} onPress={() => setHazardMenu(false)} /><Reanimated.View entering={FadeInDown.duration(240).easing(Easing.out(Easing.cubic))} exiting={FadeOutDown.duration(180)} style={[styles.hazardSheet, { paddingBottom: Math.max(insets.bottom + 18, 34) }]}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>LIVE ROAD REPORT</Text><Text style={styles.sheetTitle}>What’s ahead?</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close hazard report" style={styles.sheetClose} onPress={() => setHazardMenu(false)}><Ionicons name="close" size={18} color={colors.text} /></Pressable></View><Text style={styles.sheetBody}>CUBO pins the report at your current GPS position for this drive.</Text><View style={styles.hazardGrid}>{hazardOptions.map((option) => { const meta = hazardMeta[option.kind]; return <MotionPressable key={option.kind} style={styles.hazardOption} scaleTo={0.94} onPress={() => reportHazard(option.kind)}><View style={[styles.hazardOptionIcon, { backgroundColor: `${meta.color}18` }]}><Ionicons name={meta.icon} size={23} color={meta.color} /></View><Text style={styles.hazardOptionLabel}>{option.label}</Text><Text style={styles.hazardOptionDetail}>{option.detail}</Text></MotionPressable>; })}</View></Reanimated.View></> : null}
    <DriveBlockModal plan={driveBlockPlan} onClose={() => setDriveBlockPlan(null)} />
  </View>;
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  bottomCardIdle: { marginTop: 'auto', borderRadius: 28, paddingTop: 12, paddingHorizontal: 18, paddingBottom: 16 },
  grabberTouch: { position: 'absolute', zIndex: 30, top: 0, left: 0, right: 0, height: 34 },
  savedPlaces: { marginTop: 8 }, savedRow: { flexDirection: 'row', gap: 15, alignItems: 'center', minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  mapBack: { position: 'absolute', left: 18, top: 18, width: 48, height: 48, borderRadius: 24, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', shadowColor: c.shadow, shadowOpacity: .15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, zIndex: 13 },
  mapStyleToggle: { position: 'absolute', left: 18, top: 76, width: 48, height: 48, borderRadius: 24, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, alignItems: 'center', justifyContent: 'center', shadowColor: c.shadow, shadowOpacity: .15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, zIndex: 13 }, mapStyleToggleActive: { backgroundColor: c.accent, borderColor: c.accent },
  mapUtilities: { position: 'absolute', right: 18, top: 18, flexDirection: 'row', gap: 10, zIndex: 13 }, utilityButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', shadowColor: c.shadow, shadowOpacity: .15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, voiceButtonActive: { backgroundColor: c.accent, borderColor: c.accent },
  mapVoiceCard: { position: 'absolute', zIndex: 12, top: 78, right: 18, width: 264, padding: 14, borderRadius: 22, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong, shadowColor: c.shadow, shadowOpacity: .22, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }, mapVoiceTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, mapVoiceIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }, mapVoiceIconListening: { shadowColor: c.accent, shadowOpacity: .42, shadowRadius: 12 }, mapVoiceTitle: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 14 }, mapVoiceBody: { color: c.textSecondary, fontSize: 10, lineHeight: 14, marginTop: 2 }, mapVoiceClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, mapVoiceError: { color: c.danger, fontSize: 10, lineHeight: 14, marginTop: 10 }, mapVoiceAction: { minHeight: 44, borderRadius: 15, backgroundColor: c.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12 }, mapVoiceActionListening: { opacity: .86 }, mapVoiceActionText: { color: c.onAccent, fontFamily: 'Manrope_700Bold', fontSize: 12 },
  mapDroid: { position: 'absolute', left: 18, zIndex: 8, width: 82, height: 88, alignItems: 'center', justifyContent: 'center' }, mapDroidImage: { width: 76, height: 76, zIndex: 2 }, mapDroidGlow: { position: 'absolute', width: 70, height: 70, borderRadius: 35, backgroundColor: c.accentSoft, opacity: .72 },
  root: { flex: 1, minHeight: 0, backgroundColor: c.background }, overlay: { flex: 1, zIndex: 1, paddingHorizontal: spacing.md, paddingBottom: 12 }, overlayDrive: { paddingBottom: 12 }, fill: { flex: 1 },
  topCard: { zIndex: 10, gap: 8 }, searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 58, paddingHorizontal: 12, borderRadius: 16, backgroundColor: c.surfaceMuted }, searchInput: { flex: 1, minWidth: 0, color: c.text, fontFamily: 'Manrope_600SemiBold', fontSize: 17, paddingVertical: 8 }, inputAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, searchButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }, searchDisabled: { opacity: .35 }, searchStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4, paddingBottom: 2 }, statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }, statusText: { color: c.textSecondary, fontFamily: 'Manrope_600SemiBold', fontSize: 9 },
  guidanceCard: { minHeight: 82, borderRadius: 20, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: c.shadow, shadowOpacity: .2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }, guidanceArrived: { borderColor: c.accent, backgroundColor: c.accentSoft }, maneuverIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }, maneuverArrived: { borderRadius: 23 }, stepDistance: { color: c.accent, fontFamily: 'Manrope_800ExtraBold', fontSize: 11 }, instruction: { color: c.text, fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 18, marginTop: 2 }, closeNavigation: { width: 44, height: 44, borderRadius: 11, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  suggestions: { maxHeight: 220, borderRadius: 15, backgroundColor: c.surfaceMuted, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }, suggestion: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }, suggestionLast: { borderBottomWidth: 0 }, suggestionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }, suggestionTitle: { color: c.text, fontFamily: 'Manrope_700Bold', fontSize: 14 }, suggestionSubtitle: { color: c.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  recenter: { position: 'absolute', right: spacing.md, bottom: 300, width: 46, height: 46, borderRadius: 23, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, alignItems: 'center', justifyContent: 'center', shadowColor: c.shadow, shadowOpacity: .14, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } }, recenterActive: { backgroundColor: c.accent, borderColor: c.accent },
  voiceScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,.58)', justifyContent: 'center', padding: 24 }, voiceDialog: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 24, borderRadius: 26, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong }, voiceDialogHero: { width: 64, height: 64, borderRadius: 32, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent, marginBottom: 16, shadowColor: c.accent, shadowOpacity: .24, shadowRadius: 16 }, voiceDialogEyebrow: { color: c.accent, textAlign: 'center', fontFamily: 'Manrope_800ExtraBold', fontSize: 9, letterSpacing: 1.1 }, voiceDialogTitle: { color: c.text, textAlign: 'center', fontFamily: 'Manrope_800ExtraBold', fontSize: 22, marginTop: 7 }, voiceDialogBody: { color: c.textSecondary, textAlign: 'center', fontSize: 13, lineHeight: 20, marginTop: 10 }, voiceDialogPrimary: { minHeight: 50, borderRadius: 16, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginTop: 20 }, voiceDialogPrimaryText: { color: c.onAccent, fontFamily: 'Manrope_700Bold', fontSize: 13 }, voiceDialogSecondary: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, voiceDialogSecondaryText: { color: c.textSecondary, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  cameraPip: { position: 'absolute', left: 0, top: 0, zIndex: 6, width: 112, height: 148, borderRadius: 20, overflow: 'hidden', backgroundColor: '#080A0D', borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#000000', shadowOpacity: .26, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }, pipShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,.08)' }, pipLabel: { position: 'absolute', left: 7, right: 7, bottom: 7, minHeight: 23, paddingHorizontal: 7, borderRadius: 9, backgroundColor: 'rgba(6,12,10,.72)', flexDirection: 'row', alignItems: 'center', gap: 5 }, pipDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#45D49B' }, pipText: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 6, letterSpacing: .45 }, pipExpand: { position: 'absolute', top: 8, right: 8, textShadowColor: 'rgba(0,0,0,.5)', textShadowRadius: 4 },
  bottomCard: { marginTop: 'auto', borderRadius: 24, overflow: 'hidden', backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: 15, shadowColor: '#000', shadowOpacity: .22, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }, bottomCardDrive: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderRadius: 26 }, grabber: { width: 34, height: 4, borderRadius: 2, backgroundColor: c.surfaceMuted, alignSelf: 'center', marginBottom: 10 }, tripRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, tripRowDrive: { paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }, eyebrow: { color: c.accent, fontFamily: 'Manrope_700Bold', fontSize: 8, letterSpacing: 1 }, cardTitle: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 22, marginTop: 2 }, stats: { flexDirection: 'row', gap: 16 }, statBlock: { minWidth: 48, alignItems: 'center' }, statValue: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 14, textAlign: 'center' }, statLabel: { color: c.textTertiary, fontSize: 10, marginTop: 2, textAlign: 'center' }, compactDriveRow: { minHeight: 52, flexDirection: 'row', alignItems: 'stretch', gap: 10 }, compactMetrics: { flex: 1.45, minWidth: 0, borderRadius: 15, backgroundColor: c.surfaceMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 4 }, compactMetric: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' }, compactMetricValue: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'] }, compactMetricLabel: { color: c.textTertiary, fontSize: 8, lineHeight: 11, marginTop: 1, textTransform: 'uppercase' }, driveExpandedContent: { paddingTop: 8 }, monitoringRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 }, monitoringDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent }, monitoringDotError: { backgroundColor: c.danger }, monitoringText: { flex: 1, color: c.textSecondary, fontSize: 11, lineHeight: 16 }, startRoute: { minHeight: 48, borderRadius: 14, backgroundColor: c.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12 }, startRouteText: { color: c.onAccent, fontFamily: 'Manrope_800ExtraBold', fontSize: 12 }, driveControls: { flexDirection: 'row', gap: 8, marginTop: 2 }, reportHazard: { flex: .54, minWidth: 44, minHeight: 46, borderRadius: 14, backgroundColor: c.accentSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: c.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, reportHazardText: { color: c.accent, fontFamily: 'Manrope_800ExtraBold', fontSize: 12 }, endDrive: { flex: .92, minHeight: 48, borderRadius: 14, backgroundColor: c.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, shadowColor: c.danger, shadowOpacity: .16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, endDriveCompact: { minHeight: 52, flex: .92 }, endDriveText: { color: '#FFFFFF', fontFamily: 'Manrope_800ExtraBold', fontSize: 12 }, voiceStatus: { color: c.textSecondary, fontSize: 10, lineHeight: 14, marginTop: 6 }, driveLocationNotice: { minHeight: 48, padding: 10, borderRadius: 12, marginBottom: 8, backgroundColor: c.accentSoft }, driveLocationTitle: { color: c.accent, fontFamily: 'Manrope_700Bold', fontSize: 12 }, driveLocationBody: { color: c.textSecondary, fontSize: 11, marginTop: 4 }, driveHazardNotice: { marginBottom: 6, padding: 10, paddingRight: 42, borderRadius: 14, backgroundColor: c.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }, driveHazardText: { color: c.text, fontFamily: 'Manrope_700Bold', fontSize: 11 }, driveHazardActions: { flexDirection: 'row', gap: 8, marginTop: 8 }, driveHazardChoice: { flex: 1, minHeight: 40, borderRadius: 11, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, driveHazardDismiss: { width: 40, alignItems: 'center', justifyContent: 'center' }, driveHazardClose: { position: 'absolute', right: 4, top: 1, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, privacy: { color: c.textTertiary, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 8 },
  driverMarker: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.accent, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: c.shadow, shadowOpacity: .25, shadowRadius: 7 }, destinationPin: { width: 42, height: 48, alignItems: 'center', justifyContent: 'flex-start', shadowColor: '#000000', shadowOpacity: .24, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } }, destinationPinCenter: { position: 'absolute', top: 9, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' }, hazardPin: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, backgroundColor: 'rgba(16,31,25,.28)' }, hazardSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 21, paddingHorizontal: spacing.lg, paddingTop: 9, paddingBottom: 34, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: c.card, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border }, sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: 'center', marginBottom: 14 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetEyebrow: { color: c.accent, fontFamily: 'Manrope_700Bold', fontSize: 8, letterSpacing: 1.1 }, sheetTitle: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 22, marginTop: 2 }, sheetClose: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, sheetBody: { color: c.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 5 }, hazardGrid: { flexDirection: 'row', gap: 8, marginTop: 14 }, hazardOption: { flex: 1, minHeight: 122, borderRadius: 18, backgroundColor: c.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: 11, alignItems: 'center' }, hazardOptionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }, hazardOptionLabel: { color: c.text, fontFamily: 'Manrope_700Bold', fontSize: 12 }, hazardOptionDetail: { color: c.textTertiary, fontSize: 8, lineHeight: 12, textAlign: 'center', marginTop: 4 },
});
