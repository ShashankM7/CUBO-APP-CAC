import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useRoute, useNavigation, usePreventRemove, type NavigationProp } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
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
import { CuboAIVoice } from '../features/cuboAI/browserVoice';
import { readVoicePreference } from '../features/cuboAI/voicePreference';
import { useAuth } from '../features/auth/AuthContext';

const fallbackRegion: Region = { latitude: 35.7796, longitude: -78.6382, latitudeDelta: .035, longitudeDelta: .035 };
const hazardMeta: Record<RoadHazardKind, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  object: { icon: 'cube-outline', color: '#FFB020' }, police: { icon: 'shield-outline', color: '#3D8DFF' }, crash: { icon: 'warning-outline', color: '#FF453A' },
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

function projectAhead(point: Coordinate, heading: number, meters: number): Coordinate {
  if (!meters) return point;
  const distance = meters / 6371000;
  const bearing = heading * Math.PI / 180;
  const latitude = point.latitude * Math.PI / 180;
  const longitude = point.longitude * Math.PI / 180;
  const nextLatitude = Math.asin(Math.sin(latitude) * Math.cos(distance) + Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing));
  const nextLongitude = longitude + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude), Math.cos(distance) - Math.sin(latitude) * Math.sin(nextLatitude));
  return { latitude: nextLatitude * 180 / Math.PI, longitude: nextLongitude * 180 / Math.PI };
}

export function MapScreen() {
  const windowSize = useWindowDimensions();
  const [{ width, height }, setSize] = useState({ width: windowSize.width, height: windowSize.height });
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { persistenceError, monitoringStatus } = useDrives();
  const focused = useIsFocused();
  const screenRoute = useRoute();
  const destinationParam = (screenRoute.params as { destination?: PlaceResult } | undefined)?.destination;
  const { remember, recent } = usePlaces();
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
  const [mapStyle, setMapStyle] = useState<MapStyleMode>('street');
  const [voiceStatus, setVoiceStatus] = useState('');
  useEffect(() => { setVoiceStatus(''); }, [activeSession?.id, focused]);
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
    const cameraCenter = projectAhead(gps.point, heading, navigating ? 55 : 0);
    mapRef.current?.animateCamera({ center: cameraCenter, heading: navigating ? heading : 0, pitch: navigating ? 58 : 0, zoom: navigating ? 18 : 16, altitude: navigating ? 450 : 1800 }, { duration: navigating ? 320 : 450 });
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
      mapRef.current?.fitToCoordinates(line, { edgePadding: { top: 150, right: 45, bottom: 260, left: 45 }, animated: true });
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

  const search = async () => {
    const clean = query.trim(); if (!clean || searching || routing) return;
    dismissSearchKeyboard();
    setSearching(true); setSearchMessage('');
    try {
      const [result] = await searchPlaces(clean, gps.point);
      if (!result) { setSearchMessage('No place found'); return; }
      const destination = { latitude: result.latitude, longitude: result.longitude };
      remember(result); setQuery(result.title); setNavigationRoute(null); setSearchResult(destination); setSuggestions([]);
      // The route effect runs after the destination and GPS are both ready.
    } catch { setSearchMessage('Search unavailable'); } finally { setSearching(false); }
  };
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

  return <View style={styles.root} onLayout={event => { const { width, height } = event.nativeEvent.layout; setSize({ width, height }); }}>
    <MapView ref={mapRef} style={[StyleSheet.absoluteFill, { zIndex: 0 }]} initialRegion={fallbackRegion} attributionBottom={bottomCardHeight + insets.bottom + (!activeSession && screenRoute.name === 'Map' ? 112 : 24)} mapStyle={mapStyle} userLocation={gps.hasFix ? gps.point : null} showsUserLocation={gps.hasFix && !navigating} showsMyLocationButton={false} showsCompass={false} toolbarEnabled={false} userInterfaceStyle={mode} onPress={dismissSearchKeyboard} onPanDrag={() => { dismissSearchKeyboard(); if (navigating) setFollowing(false); }}>
      {navigationRoute ? <><Polyline coordinates={navigationRoute.coordinates} strokeColor="rgba(255,255,255,.9)" strokeWidth={11} lineCap="round" lineJoin="round" /><Polyline coordinates={navigationRoute.coordinates} strokeColor={colors.accent} strokeWidth={7} lineCap="round" lineJoin="round" /></> : null}
      {navigating && gps.point ? <Marker coordinate={gps.point} anchor={{ x: .5, y: .5 }} flat rotation={gps.point.heading ?? lastHeading.current}><View style={styles.driverMarker}><Ionicons name="arrow-up" size={20} color="#FFFFFF" /></View></Marker> : null}
      {searchResult ? <Marker coordinate={searchResult} anchor={{ x: .5, y: 1 }} title={query.trim() || 'Destination'}><View style={styles.destinationPin}><Ionicons name="location-sharp" size={36} color={colors.danger} /><View style={styles.destinationPinCenter} /></View></Marker> : null}
      {routeReports.filter((report) => report.reporterId !== community.userId).map((report) => { const meta = hazardMeta[report.kind]; return <Marker key={report.id} coordinate={report} title={`${report.kind[0].toUpperCase()}${report.kind.slice(1)} reported here`} description="Community road report"><View style={[styles.hazardPin, { backgroundColor: meta.color }]}><Ionicons name={meta.icon} size={16} color="#FFFFFF" /></View></Marker>; })}
      {hazards.map((hazard) => { const meta = hazardMeta[hazard.hazardKind ?? 'object']; return <Marker key={hazard.id} coordinate={{ latitude: hazard.latitude!, longitude: hazard.longitude! }} title={hazard.title} description={hazard.detail}><View style={[styles.hazardPin, { backgroundColor: meta.color }]}><Ionicons name={meta.icon} size={16} color="#fff" /></View></Marker>; })}
    </MapView>
    <SafeAreaView edges={['top', 'bottom']} style={[styles.overlay, !activeSession && screenRoute.name === 'Map' && { paddingBottom: 100 }, activeSession && styles.overlayDrive]} pointerEvents="box-none">
      {activeSession ? <View style={[styles.guidanceCard, navigationNotice === 'arrived' && styles.guidanceArrived]} onLayout={event => setTopCardBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}><View style={[styles.maneuverIcon, navigationNotice === 'arrived' && styles.maneuverArrived]}><Ionicons name={navigationNotice === 'arrived' || currentStep?.type === 'arrive' ? 'flag' : currentStep?.modifier?.includes('left') ? 'arrow-back' : currentStep?.modifier?.includes('right') ? 'arrow-forward' : 'arrow-up'} size={25} color={colors.onAccent} /></View><View style={styles.fill}><Text accessibilityLiveRegion="polite" style={styles.stepDistance}>{navigationNotice === 'rerouting' ? 'RECALCULATING ROUTE' : navigationNotice === 'updated' ? 'NEW ROUTE READY' : navigationNotice === 'arrived' ? 'DESTINATION REACHED' : formatStepDistance(gps.point && currentStep ? distanceMeters(gps.point, currentStep.location) : currentStep?.distanceMeters)}</Text><Text numberOfLines={2} style={styles.instruction}>{navigationNotice === 'rerouting' ? 'Finding the best way back…' : navigationNotice === 'arrived' ? `Arrived at ${query || 'your destination'}` : stepInstruction(currentStep)}</Text></View><Pressable accessibilityLabel={pipHidden ? 'Show camera' : 'Hide camera'} onPress={() => setPipHidden((value) => !value)} style={styles.closeNavigation}><Ionicons name={pipHidden ? 'videocam-outline' : 'videocam-off-outline'} size={19} color={colors.accent} /></Pressable></View> : <View style={styles.topCard}><View style={styles.searchRow}><Ionicons name="search" size={19} color={colors.textSecondary} /><TextInput ref={searchInputRef} value={query} onFocus={() => { setSearchFocused(true); setShowRecent(!query.trim() || !!searchResult); }} onBlur={() => setSearchFocused(false)} onChangeText={(value) => { setShowRecent(!value.trim()); setQuery(value); setSearchResult(null); setNavigationRoute(null); setSearchMessage(''); }} onSubmitEditing={() => void search()} returnKeyType="search" placeholder="Where do you want to go?" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />{query ? <Pressable accessibilityLabel="Clear search" onPress={() => { setQuery(''); setSearchResult(null); setNavigationRoute(null); setSearchMessage(''); setSuggestions([]); }} style={styles.inputAction}><Ionicons name="close-circle" size={19} color={colors.textTertiary} /></Pressable> : null}{searchFocused ? <Pressable accessibilityLabel="Hide keyboard" onPress={dismissSearchKeyboard} style={styles.inputAction}><Ionicons name="chevron-down" size={18} color={colors.textSecondary} /></Pressable> : null}<Pressable disabled={!query.trim() || searching || routing} onPress={() => void search()} style={[styles.searchButton, (!query.trim() || searching || routing) && styles.searchDisabled]}><Ionicons name={searching || suggesting || routing ? 'hourglass-outline' : 'arrow-forward'} size={15} color={colors.onAccent} /></Pressable></View>{searching || routing ? <View style={styles.searchStatus}><View style={styles.statusDot} /><Text style={styles.statusText}>{routing ? 'Building your route…' : 'Finding that place…'}</Text></View> : null}{showRecent && <RecentDestinations places={recent} onSelect={place => { setShowRecent(false); void chooseSuggestion(place); }} />}{!showRecent && suggestions.length ? <ScrollView style={styles.suggestions} keyboardShouldPersistTaps="always" nestedScrollEnabled>{suggestions.map((suggestion, index) => <Pressable key={suggestion.id} onPress={() => void chooseSuggestion(suggestion)} style={[styles.suggestion, index === suggestions.length - 1 && styles.suggestionLast]}><View style={styles.suggestionIcon}><Ionicons name="location" size={17} color={colors.accent} /></View><View style={styles.fill}><Text numberOfLines={1} style={styles.suggestionTitle}>{suggestion.title}</Text><Text numberOfLines={2} style={styles.suggestionSubtitle}>{suggestion.subtitle || 'Tap to view this location'}</Text></View><Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /></Pressable>)}</ScrollView> : null}</View>}
      {activeSession && focused ? <Animated.View pointerEvents={pipHidden ? 'none' : 'auto'} style={[styles.cameraPip, { opacity: pipHidden ? 0 : 1, transform: pipPosition.getTranslateTransform() }]} {...pipPan.panHandlers}><Pressable accessibilityLabel="Drag camera to a corner" style={StyleSheet.absoluteFill} onPress={() => setPipHidden(true)}><DriveAttentionCamera speedMph={gps.speedMph} gpsValid={gps.speedAvailable} /><View pointerEvents="none" style={styles.pipShade} /><View style={styles.pipLabel}><View style={styles.pipDot} /><Text style={styles.pipText}>DRAG TO A CORNER</Text></View><Pressable accessibilityLabel="Hide camera" onPress={() => setPipHidden(true)} style={{ position: 'absolute', right: 4, top: 4, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.45)', borderRadius: 12 }}><Ionicons name="remove" size={20} color="#FFFFFF" /></Pressable></Pressable></Animated.View> : null}

      <MotionPressable accessibilityLabel="Follow my location" accessibilityState={{ selected: !!activeSession && following }} style={[styles.recenter, activeSession && following && styles.recenterActive, activeSession && { bottom: bottomCardHeight + insets.bottom + 26, right: pipAtBottomRight && !pipHidden ? undefined : 16, left: pipAtBottomRight && !pipHidden ? 16 : undefined }]} scaleTo={0.9} onPress={() => { dismissSearchKeyboard(); recenter(); }}><Ionicons name="locate" size={21} color={activeSession && following ? colors.onAccent : colors.text} /></MotionPressable>
      {!activeSession && <MotionPressable accessibilityRole="switch" accessibilityLabel="Satellite view" accessibilityState={{ checked: mapStyle === 'satellite' }} style={[styles.mapStyleToggle, mapStyle === 'satellite' && styles.mapStyleToggleActive, { bottom: bottomCardHeight + insets.bottom + 82 }]} scaleTo={0.9} onPress={() => setMapStyle(value => value === 'street' ? 'satellite' : 'street')}><Ionicons name={mapStyle === 'satellite' ? 'map-outline' : 'layers-outline'} size={21} color={mapStyle === 'satellite' ? colors.onAccent : colors.text} /></MotionPressable>}
      <View style={styles.bottomCard} onLayout={(event) => setBottomCardHeight(event.nativeEvent.layout.height)}>
        {!gps.hasFix && <Pressable accessibilityRole="button" onPress={gps.retry} style={{ minHeight: 48, padding: 10, borderRadius: 12, marginBottom: 8, backgroundColor: colors.accentSoft }}><Text style={{ color: colors.accent, fontFamily: 'Manrope_700Bold', fontSize: 12 }}>Enable location</Text><Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>{gps.error || 'Waiting for a fresh GPS fix. Allow location access for this website.'}</Text></Pressable>}
        <View style={styles.grabber} /><View style={styles.tripRow}><View><Text style={styles.eyebrow}>{navigationNotice === 'arrived' ? 'ARRIVED' : activeSession ? navigationNotice === 'rerouting' ? 'RECALCULATING' : 'LIVE DRIVE' : navigationRoute ? 'ROUTE READY' : 'ROAD OVERVIEW'}</Text><Text style={styles.cardTitle}>{activeSession ? `${gps.speedAvailable ? gps.speedMph : '—'} mph` : navigationRoute ? `${(navigationRoute.distanceMeters * .000621371).toFixed(1)} mi` : gps.hasFix ? `${gps.speedAvailable ? gps.speedMph : '—'} mph` : `${hazards.length} nearby report${hazards.length === 1 ? '' : 's'}`}</Text></View><View style={styles.stats}><View><Text style={styles.statValue}>{activeSession ? `${Math.floor(activeSession.durationSeconds / 60)}:${String(activeSession.durationSeconds % 60).padStart(2, '0')}` : navigationRoute ? Math.max(1, Math.round(navigationRoute.durationSeconds / 60)) : recordedRoute.length}</Text><Text style={styles.statLabel}>{activeSession ? 'Drive time' : navigationRoute ? 'min ETA' : 'GPS points'}</Text></View><View><Text style={styles.statValue}>{activeSession ? voiceRoute ? Math.max(0, Math.ceil(voiceRoute.seconds / 60)) : '—' : hazards.length}</Text><Text style={styles.statLabel}>{activeSession ? 'min left' : 'Hazards'}</Text></View></View></View>
      {activeSession && (hazardPrompt || nearbyReport) ? <View style={{ marginTop: 12, padding: 14, paddingRight: hazardPrompt ? 14 : 44, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.text, fontFamily: 'Manrope_700Bold', fontSize: 13 }}>{hazardPrompt ? 'Do you still see this ' + hazardPrompt.kind + '?' : `${nearbyReport!.report.kind[0].toUpperCase()}${nearbyReport!.report.kind.slice(1)} reported ahead · ${Math.round(nearbyReport!.distance)} m`}</Text>{hazardPrompt ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>{[true, false].map((present) => <Pressable key={String(present)} style={{ flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: present ? colors.accentSoft : colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }} onPress={() => { void community.confirm(hazardPrompt, present).then((sent) => { if (sent) { setPromptDismissed(value => new Set([...value, hazardPrompt.id])); setHazardPrompt(null); } }); }}><Text style={{ color: colors.text }}>{present ? 'Still there' : 'Gone'}</Text></Pressable>)}<Pressable accessibilityLabel="Dismiss confirmation" style={{ width: 44, alignItems: 'center', justifyContent: 'center' }} onPress={() => { setPromptDismissed((value) => new Set([...value, hazardPrompt.id])); setHazardPrompt(null); }}><Ionicons name="close" size={20} color={colors.textSecondary} /></Pressable></View> : <Pressable accessibilityLabel="Dismiss hazard alert" style={{ position: 'absolute', right: 6, top: 3, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} onPress={() => setPromptDismissed((value) => new Set([...value, nearbyReport!.report.id]))}><Ionicons name="close" size={18} color={colors.textSecondary} /></Pressable>}</View> : null}
        {activeSession ? <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontSize: 12, marginTop: 8 }}>{persistenceError ?? monitoringStatus}</Text> : null}{navigationRoute && !activeSession ? <MotionPressable onPress={startNavigation} style={styles.startRoute} scaleTo={0.96}><Ionicons name="navigate" size={17} color={colors.onAccent} /><Text style={styles.startRouteText}>Start drive</Text></MotionPressable> : null}
        {activeSession ? <View style={styles.driveControls}><MotionPressable accessibilityLabel="End drive" style={styles.endDrive} scaleTo={0.95} onPress={finishDrive}><Ionicons name="stop-circle" size={18} color="#FFFFFF" /><Text style={styles.endDriveText}>End drive</Text></MotionPressable><DriveVoiceControl onReroute={(choice, signal) => voiceRoutes.run(choice, signal)} live={{ point: gps.point ?? undefined, gpsValid: gps.hasFix && gps.status !== 'weak', speed: gps.speedAvailable ? gps.speedMph : undefined, nextTurn: currentStep ? stepInstruction(currentStep) : undefined, destination: navigationRoute ? query : undefined, routeSteps: voiceInstructions, routeIndex: stepIndex, routeId: navigationRoute ? `${query}:${navigationRoute.durationSeconds}:${navigationRoute.coordinates.length}` : undefined, remainingSeconds: voiceRoute?.seconds, remainingMiles: voiceRoute?.miles }} onStatus={setVoiceStatus} /><MotionPressable accessibilityLabel={hazardSaved ? 'Hazard saved. Report another hazard' : 'Report hazard'} style={[styles.reportHazard, { flex: .54, minWidth: 44 }]} scaleTo={0.95} onPress={() => setHazardMenu(true)}><Ionicons name={hazardSaved ? 'checkmark-circle' : 'megaphone-outline'} size={20} color={colors.accent} /></MotionPressable></View> : null}
        {activeSession && voiceStatus ? <Text numberOfLines={3} style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 8 }}>{voiceStatus}</Text> : null}
        {!activeSession ? <MotionPressable onPress={() => navigation.navigate('ReturningHome')} style={{ minHeight: 44, marginTop: 8, backgroundColor: colors.surfaceMuted, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="home-outline" size={17} color={colors.accent} /><Text style={{ color: colors.text, fontFamily: 'Manrope_700Bold', fontSize: 12 }}>Back to home</Text></MotionPressable> : null}
        <Text accessibilityLiveRegion="polite" style={styles.privacy}>{arrivalCompleting ? 'Arrival confirmed · saving your drive…' : community.error || searchMessage || (navigationRoute ? navigating ? `${following ? 'Following your location' : 'Map unlocked'} · Tap locate to recenter` : 'Preview the route, then start when you are ready.' : 'Choose a destination, then press Start drive.')}</Text>
      </View>
    </SafeAreaView>
    {hazardMenu ? <><Pressable style={styles.sheetBackdrop} onPress={() => setHazardMenu(false)} /><Reanimated.View entering={FadeInDown.duration(240).easing(Easing.out(Easing.cubic))} exiting={FadeOutDown.duration(180)} style={[styles.hazardSheet, { paddingBottom: Math.max(insets.bottom + 18, 34) }]}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>LIVE ROAD REPORT</Text><Text style={styles.sheetTitle}>What’s ahead?</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close hazard report" style={styles.sheetClose} onPress={() => setHazardMenu(false)}><Ionicons name="close" size={18} color={colors.text} /></Pressable></View><Text style={styles.sheetBody}>CUBO pins the report at your current GPS position for this drive.</Text><View style={styles.hazardGrid}>{hazardOptions.map((option) => { const meta = hazardMeta[option.kind]; return <MotionPressable key={option.kind} style={styles.hazardOption} scaleTo={0.94} onPress={() => reportHazard(option.kind)}><View style={[styles.hazardOptionIcon, { backgroundColor: `${meta.color}18` }]}><Ionicons name={meta.icon} size={23} color={meta.color} /></View><Text style={styles.hazardOptionLabel}>{option.label}</Text><Text style={styles.hazardOptionDetail}>{option.detail}</Text></MotionPressable>; })}</View></Reanimated.View></> : null}
    <DriveBlockModal plan={driveBlockPlan} onClose={() => setDriveBlockPlan(null)} />
  </View>;
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: c.background }, overlay: { flex: 1, zIndex: 1, paddingHorizontal: spacing.md, paddingBottom: 12 }, overlayDrive: { paddingBottom: 12 }, fill: { flex: 1 },
  topCard: { zIndex: 10, minHeight: 64, borderRadius: 20, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: 8, gap: 8, shadowColor: c.shadow, shadowOpacity: .18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }, searchRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, searchInput: { flex: 1, minWidth: 0, color: c.text, fontFamily: 'Manrope_600SemiBold', fontSize: 16, paddingVertical: 8 }, inputAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, searchButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }, searchDisabled: { opacity: .35 }, searchStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4, paddingBottom: 2 }, statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }, statusText: { color: c.textSecondary, fontFamily: 'Manrope_600SemiBold', fontSize: 9 },
  guidanceCard: { minHeight: 82, borderRadius: 20, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: c.shadow, shadowOpacity: .2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }, guidanceArrived: { borderColor: c.accent, backgroundColor: c.accentSoft }, maneuverIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }, maneuverArrived: { borderRadius: 23 }, stepDistance: { color: c.accent, fontFamily: 'Manrope_800ExtraBold', fontSize: 11 }, instruction: { color: c.text, fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 18, marginTop: 2 }, closeNavigation: { width: 44, height: 44, borderRadius: 11, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  suggestions: { maxHeight: 220, borderRadius: 15, backgroundColor: c.surfaceMuted, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }, suggestion: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }, suggestionLast: { borderBottomWidth: 0 }, suggestionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }, suggestionTitle: { color: c.text, fontFamily: 'Manrope_700Bold', fontSize: 14 }, suggestionSubtitle: { color: c.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  recenter: { position: 'absolute', right: spacing.md, bottom: 300, width: 46, height: 46, borderRadius: 15, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, alignItems: 'center', justifyContent: 'center', shadowColor: c.shadow, shadowOpacity: .14, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } }, recenterActive: { backgroundColor: c.accent, borderColor: c.accent },
  mapStyleToggle: { position: 'absolute', right: spacing.md, width: 46, height: 46, borderRadius: 15, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, alignItems: 'center', justifyContent: 'center', shadowColor: c.shadow, shadowOpacity: .14, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } }, mapStyleToggleActive: { backgroundColor: c.accent, borderColor: c.accent },
  cameraPip: { position: 'absolute', left: 0, top: 0, zIndex: 6, width: 112, height: 148, borderRadius: 20, overflow: 'hidden', backgroundColor: '#080A0D', borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#000000', shadowOpacity: .26, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }, pipShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,.08)' }, pipLabel: { position: 'absolute', left: 7, right: 7, bottom: 7, minHeight: 23, paddingHorizontal: 7, borderRadius: 9, backgroundColor: 'rgba(6,12,10,.72)', flexDirection: 'row', alignItems: 'center', gap: 5 }, pipDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#45D49B' }, pipText: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 6, letterSpacing: .45 }, pipExpand: { position: 'absolute', top: 8, right: 8, textShadowColor: 'rgba(0,0,0,.5)', textShadowRadius: 4 },
  bottomCard: { marginTop: 'auto', borderRadius: 24, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: 15, shadowColor: '#000', shadowOpacity: .22, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }, grabber: { width: 34, height: 4, borderRadius: 2, backgroundColor: c.surfaceMuted, alignSelf: 'center', marginBottom: 12 }, tripRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { color: c.accent, fontFamily: 'Manrope_700Bold', fontSize: 8, letterSpacing: 1 }, cardTitle: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 22, marginTop: 2 }, stats: { flexDirection: 'row', gap: 20 }, statValue: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 14 }, statLabel: { color: c.textTertiary, fontSize: 10, marginTop: 2 }, startRoute: { minHeight: 48, borderRadius: 14, backgroundColor: c.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12 }, startRouteText: { color: c.onAccent, fontFamily: 'Manrope_800ExtraBold', fontSize: 12 }, driveControls: { flexDirection: 'row', gap: 8, marginTop: 12 }, reportHazard: { flex: 1.08, minHeight: 48, borderRadius: 14, backgroundColor: c.accentSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: c.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, reportHazardText: { color: c.accent, fontFamily: 'Manrope_800ExtraBold', fontSize: 12 }, endDrive: { flex: .92, minHeight: 48, borderRadius: 14, backgroundColor: c.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, shadowColor: c.danger, shadowOpacity: .16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, endDriveText: { color: '#FFFFFF', fontFamily: 'Manrope_800ExtraBold', fontSize: 12 }, privacy: { color: c.textTertiary, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 8 },
  driverMarker: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.accent, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: c.shadow, shadowOpacity: .25, shadowRadius: 7 }, destinationPin: { width: 42, height: 48, alignItems: 'center', justifyContent: 'flex-start', shadowColor: '#000000', shadowOpacity: .24, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } }, destinationPinCenter: { position: 'absolute', top: 9, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' }, hazardPin: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, backgroundColor: 'rgba(16,31,25,.28)' }, hazardSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 21, paddingHorizontal: spacing.lg, paddingTop: 9, paddingBottom: 34, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: c.card, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border }, sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: 'center', marginBottom: 14 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetEyebrow: { color: c.accent, fontFamily: 'Manrope_700Bold', fontSize: 8, letterSpacing: 1.1 }, sheetTitle: { color: c.text, fontFamily: 'Manrope_800ExtraBold', fontSize: 22, marginTop: 2 }, sheetClose: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, sheetBody: { color: c.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 5 }, hazardGrid: { flexDirection: 'row', gap: 8, marginTop: 14 }, hazardOption: { flex: 1, minHeight: 122, borderRadius: 18, backgroundColor: c.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: 11, alignItems: 'center' }, hazardOptionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }, hazardOptionLabel: { color: c.text, fontFamily: 'Manrope_700Bold', fontSize: 12 }, hazardOptionDetail: { color: c.textTertiary, fontSize: 8, lineHeight: 12, textAlign: 'center', marginTop: 4 },
});
