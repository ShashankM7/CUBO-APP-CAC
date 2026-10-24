import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAppearance } from '../theme/AppearanceContext';

import { useAuth } from '../features/auth/AuthContext';
import { useDrives } from '../features/drives/DriveContext';
import { useVehicles } from '../features/vehicles/VehicleContext';
import { insuranceProviders } from '../features/insurance/InsuranceContext';
import { accountContext } from '../features/cuboAI/appContext';
import { CuboAIVoice, isRecoverableMicrophoneFailure } from '../features/cuboAI/browserVoice';
import type { DriveVoiceSnapshot } from '../features/cuboAI/driveCommands';
import { DriveConversation } from '../features/cuboAI/driveConversation';
import { readVoicePreference } from '../features/cuboAI/voicePreference';
import type { LocalAnswerDetails } from '../features/cuboAI/quickAnswers';
import { driveConsent } from '../features/cuboAI/driveConsent';
import type { VoiceRouteResult } from '../features/navigation/voiceRoutes';
import { useAppBlocking } from '../features/appBlocking/AppBlockingContext';
import { BLOCK_APPS } from '../data/blockApps';
import { VoiceAssistIcon } from './VoiceAssistIcon';
import { requestMediaAccess } from '../features/permissions/mediaAccess';
import { accessError } from '../features/permissions/accessErrors';

type Props = { live: Pick<DriveVoiceSnapshot, 'point' | 'gpsValid' | 'speed' | 'nextTurn' | 'destination' | 'routeSteps' | 'routeIndex' | 'routeId' | 'remainingSeconds' | 'remainingMiles'>; onStatus: (text: string) => void; onReroute?: (choice: number | undefined, signal: AbortSignal) => Promise<VoiceRouteResult> };
export function DriveVoiceControl(props: Props) {
  const { user } = useAuth(); const { activeSession } = useDrives();
  return user && activeSession ? <Control key={`${user.uid}:${activeSession.id}`} {...props} uid={user.uid} tripId={activeSession.id} /> : null;
}
function Control({ live, onStatus, onReroute, uid, tripId }: Props & { uid: string; tripId: string }) {
  const { colors: c } = useAppearance();
  const focused = useIsFocused(); const { user } = useAuth();
  const { activeSession, sessions, monitoringStatus, addEvent, voiceMemory, addVoiceTurn } = useDrives();
  const { vehicles, ready } = useVehicles();
  const { hydrated: blockedAppsReady, policyFor: blockedAppsPolicyFor } = useAppBlocking();
  const blockedAppsPolicy = blockedAppsPolicyFor(uid, user?.displayName ?? 'You');
  const blockedAppNames = BLOCK_APPS.filter(app => blockedAppsPolicy.selectedIds.includes(app.id)).map(app => app.name);
  const [details, setDetails] = useState<LocalAnswerDetails>({});
  const [enabled, setEnabled] = useState(false); const [notice, setNotice] = useState(false);
  const [micRecovery, setMicRecovery] = useState(false); const [micRetrying, setMicRetrying] = useState(false); const micRecoveryShown = useRef(false);
  const [consent] = useState(() => { let store; try { store = window.sessionStorage; } catch {} return driveConsent(store, uid, tripId); });
  const conversation = useRef<DriveConversation | null>(null); const voice = useRef<CuboAIVoice | null>(null);
  const routeRequest = useRef<AbortController | null>(null);
  const reroute = useRef(onReroute); reroute.current = onReroute;
  const assistantDetails: LocalAnswerDetails = { ...details, blockedAppsReady, blockedAppsEnabled: blockedAppsPolicy.enabled, blockedAppNames, childLock: blockedAppsPolicy.lockedByParent };
  const latest = useRef({ user, activeSession, focused, live, details: assistantDetails, vehicles, ready, sessions, monitoringStatus, addEvent, onStatus });
  latest.current = { user, activeSession, focused, live, details: assistantDetails, vehicles, ready, sessions, monitoringStatus, addEvent, onStatus };
  const alive = useRef(false);
  const allowed = () => alive.current && latest.current.user?.uid === uid && latest.current.activeSession?.id === tripId && latest.current.focused && !document.hidden;
  useEffect(() => {
    let current = true;
    void Promise.all([AsyncStorage.getItem(`cubo-places:${uid}`), AsyncStorage.getItem(`cubo-insurance:${uid}`)]).then(([p, i]) => {
      const places = p ? JSON.parse(p) : {}; const insurance = i ? JSON.parse(i) : {};
      const place = (value: { title?: string; subtitle?: string } | undefined) => [value?.title, value?.subtitle].filter(v => typeof v === 'string').join(', ').slice(0, 240);
      if (current) setDetails({ ready: true, home: place(places?.home), work: place(places?.work), insurer: insurance?.providerId === 'other' ? insurance.customProviderName : insuranceProviders.find(p => p.id === insurance?.providerId)?.name, mode: insurance?.mode, cadence: insurance?.cadence });
    }).catch(() => {});
    return () => { current = false; };
  }, [uid]);
  useEffect(() => {
    alive.current = true; voice.current = new CuboAIVoice(allowed, () => readVoicePreference(localStorage, uid));
    const hidden = () => { if (document.hidden) { conversation.current?.stop('Voice off · app hidden'); setNotice(false); } };
    const warning = () => conversation.current?.stop('Voice off · attention warning');
    document.addEventListener('visibilitychange', hidden); window.addEventListener('cubo-attention-warning', warning);
    return () => { alive.current = false; conversation.current?.stop(); voice.current?.dispose(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('cubo-attention-warning', warning); };
  }, [uid, tripId]);
  useEffect(() => { if (!focused) { conversation.current?.stop(); setNotice(false); } }, [focused]);
  function recoverMicrophone(message: string) {
    if (isRecoverableMicrophoneFailure(message) && !micRecoveryShown.current) { micRecoveryShown.current = true; conversation.current?.stop(); setEnabled(false); setMicRecovery(true); onStatus(''); }
    else onStatus(message);
  }
  async function enableMicrophoneAndRetry() {
    if (micRetrying) return;
    setMicRetrying(true);
    try { await requestMediaAccess('microphone'); setMicRecovery(false); start(); }
    catch (cause) { setMicRecovery(false); onStatus(accessError(cause)); }
    finally { setMicRetrying(false); }
  }
  function start() {
    setNotice(false);
    consent.accept();
    if (!allowed() || !voice.current) return;
    if (!voice.current.supported().input || !voice.current.supported().output) { onStatus('Voice unavailable in this browser. Use the controls when parked.'); return; }
    if (!voiceMemory) return;
    conversation.current?.stop(); const commands = voiceMemory;
    conversation.current = new DriveConversation(voice.current, allowed, async text => {
      if (!allowed()) throw Error('Drive ended');
      const v = latest.current; const trip = v.activeSession!;
      const fresh = !!v.live.point && Date.now() - v.live.point.timestamp <= 15000;
      let result = commands.answer(text, { ...v.live, history: trip.voiceTranscript, gpsValid: v.live.gpsValid && fresh, tripId, durationSeconds: trip.durationSeconds, distanceMiles: trip.distanceMiles, score: trip.attentionMeasured ? trip.focusScore : undefined, monitoring: v.monitoringStatus, details: v.details, account: accountContext({ name: v.user?.displayName, vehicles: v.vehicles, vehiclesReady: v.ready, sessions: v.sessions, calibration: 'unknown' }) });
      if (result.reroute || result.routeChoice != null) {
        routeRequest.current?.abort(); const controller = new AbortController(); routeRequest.current = controller;
        const answer = await reroute.current?.(result.routeChoice, controller.signal);
        if (!allowed() || controller.signal.aborted) throw Error('Request cancelled');
        result = answer?.options ? commands.offerRoutes(answer.options) : commands.rememberReply(answer?.text || 'Rerouting is unavailable. Keeping your current route.');
      }
      if (result.report) {
        if (!allowed() || result.report.tripId !== trip.id) throw Error('Drive changed');
        v.addEvent({ type: 'road_hazard', hazardKind: result.report.kind, severity: result.report.kind === 'crash' ? 'warning' : 'info', title: `${result.report.kind} reported by voice`, detail: 'Confirmed voice report. Saved to this trip only; not published to other drivers.', elapsedSeconds: trip.durationSeconds, speedMph: v.live.speed ?? 0, ...result.report.point });
      }
      addVoiceTurn(tripId, 'user', text);
      addVoiceTurn(tripId, 'assistant', result.text);
      return result;
    }, (active, text) => { if (!active) routeRequest.current?.abort(); if (alive.current) { setEnabled(active); if (!active && text !== 'Voice off') recoverMicrophone(text); else latest.current.onStatus(text); } }, Date.now, commands);
    conversation.current.start();
  }
  return <><Pressable accessibilityRole="switch" accessibilityLabel="Cubo Voice Assist" accessibilityState={{ checked: enabled }} onPress={() => enabled ? conversation.current?.stop() : consent.accepted() ? start() : setNotice(true)} style={{ flex: .54, minWidth: 44, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: enabled ? c.accent : c.surfaceMuted, borderWidth: 1, borderColor: enabled ? c.accent : c.borderStrong }}>
    <VoiceAssistIcon size={23} color={enabled ? c.onAccent : c.textSecondary} />
  </Pressable><Modal visible={notice} transparent animationType="fade" onRequestClose={() => setNotice(false)}>
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', padding: 24 }}><View accessibilityViewIsModal style={{ backgroundColor: c.card, padding: 24, borderRadius: 24, gap: 16, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>Cubo Voice Assist</Text>
      <Text style={{ color: c.textSecondary, fontSize: 15, lineHeight: 22 }}>Set this up while parked. Tap AI to turn voice on or off. Say “Hey Cubo” and your question, then ask follow-ups. Say “Stop talking” to interrupt where supported; tap AI to stop immediately if your browser cannot interrupt. To switch off hands-free, ask to turn off voice assist and confirm after the reply.</Text>
      <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 21 }}>While enabled, your browser may process audio online, including surrounding speech. CUBO saves accepted questions and replies—not raw audio—as a bounded text transcript with this trip. Completed-trip text syncs to your signed-in account and may include personal details. Delete it in the trip summary to remove it from the next synced copy. Keep the app visible; browser interruptions or attention warnings turn voice off.</Text>
      <Pressable onPress={start} style={{ backgroundColor: c.accent, padding: 15, borderRadius: 14, alignItems: 'center' }}><Text style={{ color: c.onAccent, fontWeight: '700' }}>Agree & start listening</Text></Pressable>
      <Pressable onPress={() => setNotice(false)} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: c.textSecondary }}>Not now</Text></Pressable>
    </View></View>
  </Modal><Modal visible={micRecovery} transparent animationType="fade" onRequestClose={() => setMicRecovery(false)}><View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', padding: 24 }}><View accessibilityViewIsModal style={{ backgroundColor: c.card, padding: 24, borderRadius: 24, gap: 16, maxWidth: 420, width: '100%', alignSelf: 'center' }}><View style={{ width: 60, height: 60, borderRadius: 30, alignSelf: 'center', backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="mic-outline" size={28} color={c.onAccent} /></View><Text style={{ color: c.text, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>Enable your microphone</Text><Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>CUBO did not detect usable audio. Open the browser microphone prompt, then Voice Assist will retry once.</Text><Pressable disabled={micRetrying} onPress={() => void enableMicrophoneAndRetry()} style={{ backgroundColor: c.accent, padding: 15, borderRadius: 14, alignItems: 'center' }}><Text style={{ color: c.onAccent, fontWeight: '700' }}>{micRetrying ? 'Checking microphone…' : 'Enable microphone & retry'}</Text></Pressable><Pressable disabled={micRetrying} onPress={() => setMicRecovery(false)} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: c.textSecondary }}>Not now</Text></Pressable></View></View></Modal></>;
}
