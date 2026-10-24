import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../features/auth/AuthContext';
import { useDrives } from '../features/drives/DriveContext';
import { useAppearance } from '../theme/AppearanceContext';
import { CuboAISession } from '../features/cuboAI/session';
import { CuboAIVoice } from '../features/cuboAI/browserVoice';
import { createWorkerFactory } from '../features/cuboAI/workerClient';
import { accountKey, readState, writeState, weekStart, WEEKLY_REPLIES, type LocalAIState } from '../features/cuboAI/localState';
import { usageBadge } from '../features/cuboAI/presentation';
import { accountContext, type AccountSnapshot } from '../features/cuboAI/appContext';
import { useVehicles } from '../features/vehicles/VehicleContext';
import { readCalibration } from '../features/calibration/calibrationStatus';
import { startupKeys, startupState } from '../features/cuboAI/startup';
import { readVoicePreference } from '../features/cuboAI/voicePreference';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocalAnswerDetails } from '../features/cuboAI/quickAnswers';
import { insuranceProviders } from '../features/insurance/InsuranceContext';
import { useIsFocused } from '@react-navigation/native';
import { DriveConversation } from '../features/cuboAI/driveConversation';
import { usePlaces } from '../features/places/PlacesContext';
import { AssistantDestination } from '../features/cuboAI/assistantDestination';
import type { PlaceResult } from '../features/places/searchPlaces';
import { AssistantVoice } from '../features/cuboAI/assistantVoice';
import { useAppBlocking } from '../features/appBlocking/AppBlockingContext';
import { BLOCK_APPS } from '../data/blockApps';
import { compactAssistantState, mergeAssistantState } from '../features/sync/domainData';
import { useAccountSyncBridge } from '../features/sync/useAccountSyncBridge';

const MODEL = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';
type Props = NativeStackScreenProps<RootStackParamList, 'CuboAI'>;
export function CuboAIScreen(props: Props) {
  const { user } = useAuth();
  return user ? <Chat key={user.uid} {...props} uid={user.uid} /> : null;
}
function Chat({ navigation, uid }: Props & { uid: string }) {
  const [hasLocalAIRecord] = useState(() => { try { return window.localStorage.getItem(accountKey(uid)) !== null; } catch { return false; } });
  const focused = useIsFocused();
  const { colors: c, mode } = useAppearance();
  const { user } = useAuth(); const { activeSession, sessions } = useDrives();
  const places = usePlaces();
  const placesRef = useRef(places); placesRef.current = places;
  const destinations = useRef<AssistantDestination | null>(null);
  destinations.current ??= new AssistantDestination(() => ({ ...placesRef.current, origin: placesRef.current.home }));
  const [mapConfirmation, setMapConfirmation] = useState<PlaceResult | null>(null);
  const [destinationChoices, setDestinationChoices] = useState<PlaceResult[]>([]);
  const pendingDestination = useRef<PlaceResult | null>(null);
  const addressRequest = useRef<AbortController | null>(null);
  const { vehicles, ready: vehiclesReady } = useVehicles();
  const { hydrated: blockedAppsReady, policyFor: blockedAppsPolicyFor } = useAppBlocking();
  const blockedAppsPolicy = blockedAppsPolicyFor(uid, user?.displayName ?? 'You');
  const blockedAppNames = BLOCK_APPS.filter(app => blockedAppsPolicy.selectedIds.includes(app.id)).map(app => app.name);
  const [localDetails, setLocalDetails] = useState<LocalAnswerDetails>({});
  useEffect(() => {
    let active = true;
    // Read only this signed-in account. Never send saved addresses to the model snapshot.
    void Promise.all([AsyncStorage.getItem(`cubo-places:${uid}`), AsyncStorage.getItem(`cubo-insurance:${uid}`)]).then(([p, i]) => {
      const places = p ? JSON.parse(p) : {}; const insurance = i ? JSON.parse(i) : {};
      const place = (value: { title?: string; subtitle?: string } | undefined) => [value?.title, value?.subtitle].filter(v => typeof v === 'string').join(', ').slice(0, 240);
      if (active) setLocalDetails({ ready: true, home: place(places?.home), work: place(places?.work), insurer: insurance?.providerId === 'other' ? insurance.customProviderName : insuranceProviders.find(p => p.id === insurance?.providerId)?.name, mode: insurance?.mode, cadence: insurance?.cadence });
    }).catch(() => {});
    return () => { active = false; };
  }, [uid]);
  const [calibration, setCalibration] = useState<AccountSnapshot['calibration']>('unknown');
  useEffect(() => { let active = true; void readCalibration().then(record => { if (active) setCalibration(record ? 'completed' : 'not completed'); }).catch(() => {}); return () => { active = false; }; }, [uid]);
  const snapshot = { name: user?.displayName, vehicles, vehiclesReady, sessions, calibration };
  const assistantDetails: LocalAnswerDetails = { ...localDetails, blockedAppsReady, blockedAppsEnabled: blockedAppsPolicy.enabled, blockedAppNames, childLock: blockedAppsPolicy.lockedByParent };
  const latest = useRef({ uid: user?.uid, driving: !!activeSession, snapshot, localDetails: assistantDetails, focused }); latest.current = { uid: user?.uid, driving: !!activeSession, snapshot, localDetails: assistantDetails, focused };
  const session = useRef<CuboAISession | null>(null); const voice = useRef<CuboAIVoice | null>(null);
  const alive = useRef(true); const epoch = useRef(0); const end = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<LocalAIState | null>(null);
  const [notice, setNotice] = useState(true); const [dontShow, setDontShow] = useState(false);
  const [draft, setDraft] = useState(''); const [source, setSource] = useState<'text' | 'voice'>('text');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'thinking'>('idle');
  const [progress, setProgress] = useState(0); const [error, setError] = useState('');
  const [loadStatus, setLoadStatus] = useState('');
  const modelKeys = startupKeys(uid, MODEL);
  const [listening, setListening] = useState(false); const [voiceConsent, setVoiceConsent] = useState<'dictation' | 'assistant' | 'read' | null>(null);
  const [reading, setReading] = useState<number | null>(null);
  const pendingRead = useRef<{ index: number; text: string } | null>(null);
  const [voiceOn, setVoiceOn] = useState(false); const [voiceStatus, setVoiceStatus] = useState('');
  const conversation = useRef<DriveConversation | null>(null);
  const voiceApproved = useRef({ dictation: false, assistant: false, read: false });
  const [license, setLicense] = useState(false); const [licenseText, setLicenseText] = useState(''); const [licenseError, setLicenseError] = useState('');
  const [settings, setSettings] = useState(false); const [notes, setNotes] = useState(''); const [clear, setClear] = useState(false);
  const noticeKey = accountKey(uid) + ':notice-v3';
  const recoveryKey = accountKey(uid) + ':interrupted';
  const emptyAIState: LocalAIState = { version: 1, owner: uid, week: weekStart(Date.now()), used: 0, memory: '', messages: [] };
  const applyCloudState = useCallback((next: LocalAIState) => { if (next.owner === uid) { writeState(window.localStorage, next); setData(next); } }, [uid]);
  useAccountSyncBridge({ uid, domain: 'assistant', ready: data !== null, value: data ?? emptyAIState, normalize: compactAssistantState, prepare: compactAssistantState, merge: mergeAssistantState, mergeInitial: hasLocalAIRecord, onRemote: applyCloudState, delayMs: 1000 });
  const allowed = () => alive.current && latest.current.uid === uid && latest.current.focused && !latest.current.driving && !document.hidden;
  function openDestination() {
    const destination = pendingDestination.current; pendingDestination.current = null;
    if (!destination || !allowed()) return;
    stopVoice(); setPhase(session.current?.hasModel() ? 'ready' : 'idle'); setDestinationChoices([]);
    placesRef.current.remember(destination);
    navigation.navigate('DriveMap', { destination });
  }
  useEffect(() => {
    if (!focused) { addressRequest.current?.abort(); destinations.current?.clear(); setDestinationChoices([]); setMapConfirmation(null); pendingDestination.current = null; }
    return () => { addressRequest.current?.abort(); };
  }, [focused]);
  async function addressAction(text: string) {
    addressRequest.current?.abort();
    const controller = new AbortController(); addressRequest.current = controller;
    const result = await destinations.current!.answer(text, controller.signal);
    if (!allowed() || controller.signal.aborted) throw Error('Address request cancelled.');
    if (!result) { setDestinationChoices([]); setMapConfirmation(null); return null; }
    setDestinationChoices(result.choices); setMapConfirmation(result.confirmation ?? null);
    pendingDestination.current = result.destination ?? null;
    return result.text;
  }
  function stopVoice() { conversation.current?.stop(); voice.current?.stop(); setListening(false); setReading(null); }
  function readReply(index: number, text: string) {
    if (reading === index) { stopVoice(); return; }
    stopVoice(); pendingRead.current = { index, text };
    if (!voiceApproved.current.read && !voiceApproved.current.assistant) { setVoiceConsent('read'); return; }
    startRead(true);
  }
  function startRead(interruptible: boolean) {
    setVoiceConsent(null);
    const reply = pendingRead.current; pendingRead.current = null;
    if (!reply || !allowed() || !voice.current) return;
    if (interruptible) voiceApproved.current.read = true;
    setReading(reply.index);
    try {
      voice.current.speak(reply.text, () => setReading(null), () => { setReading(null); setError('Read-aloud stopped. You can retry Listen.'); });
      if (interruptible) voice.current.watchInterrupt(reply.text, stopVoice);
    } catch (cause) { setReading(null); report(cause); }
  }
  useEffect(() => {
    if (!license || licenseText) return;
    const controller = new AbortController(); setLicenseError('');
    void fetch('/licenses/llama-3.2.txt', { signal: controller.signal }).then(response => { if (!response.ok) throw Error('License unavailable'); return response.text(); }).then(text => { if (!controller.signal.aborted) setLicenseText(text); }).catch(() => { if (!controller.signal.aborted) setLicenseError('The license could not load. Close this panel and try again when online.'); });
    return () => controller.abort();
  }, [license, licenseText]);
  useEffect(() => { if (!focused || notice || settings || license) stopVoice(); }, [focused, notice, settings, license]);
  const refresh = () => { if (alive.current && latest.current.uid === uid) setData(readState(window.localStorage, uid)); };
  function makeSession() {
    const runtime = createWorkerFactory(MODEL);
    return new CuboAISession({ uid, currentUid: () => latest.current.uid ?? null, isDriving: () => latest.current.driving,
      store: window.localStorage, appContext: () => accountContext(latest.current.snapshot),
      localDetails: () => latest.current.localDetails, localAction: addressAction,
      loadModel: runtime.load, cancelLoad: runtime.stop });
  }
  const report = (cause: unknown) => { if (alive.current) setError(cause instanceof Error ? cause.message : 'Cubo Assistant could not finish. Please try again.'); };
  useEffect(() => {
    alive.current = true;
    voiceApproved.current = { dictation: false, assistant: false, read: false };
    pendingRead.current = null;
    try {
      const startup = startupState(localStorage, uid, MODEL);
      if (startup.interruptedLoad) {
        setError('General AI preparation was interrupted. Quick answers are available without retrying the model.');
      }
    } catch (cause) { report(cause); }
    try { session.current = makeSession(); refresh(); setNotice(localStorage.getItem(noticeKey) !== 'hidden'); }
    catch (cause) { report(cause); }
    try {
      const interrupted = localStorage.getItem(recoveryKey);
      if (interrupted) { setDraft(interrupted.slice(0, 1000)); setError('Your previous reply was interrupted. Your question is restored; it has not been sent again.'); }
    } catch (cause) { report(cause); }
    voice.current = new CuboAIVoice(allowed, () => readVoicePreference(localStorage, uid));
    const suspend = () => { if (!document.hidden) return; epoch.current++; stopVoice(); void session.current?.dispose().catch(() => {}); session.current = null; try { localStorage.removeItem(modelKeys.loading); } catch {} setPhase('idle'); };
    const sync = () => { try { refresh(); } catch (cause) { report(cause); } };
    document.addEventListener('visibilitychange', suspend); window.addEventListener('storage', sync);
    const timer = setInterval(sync, 30000);
    return () => { alive.current = false; epoch.current++; clearInterval(timer); document.removeEventListener('visibilitychange', suspend); window.removeEventListener('storage', sync); conversation.current?.stop(); voice.current?.dispose(); void session.current?.dispose().catch(() => {}); try { localStorage.removeItem(modelKeys.loading); } catch {} };
  }, [uid]);
  useEffect(() => { if (activeSession) { epoch.current++; stopVoice(); void session.current?.dispose().catch(() => {}); session.current = null; setPhase('idle'); } }, [activeSession?.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'auto' }); }, [data?.messages.length, phase]);
  const badge = usageBadge(data?.used ?? 0); const exhausted = badge.percent === 0;
  const blocked = notice || !!activeSession || !data || exhausted;
  async function load() {
    if (blocked || !allowed() || phase === 'loading' || voiceOn) return;
    const version = epoch.current; setError(''); setPhase('loading'); setProgress(0);
    try {
      localStorage.setItem(modelKeys.loading, 'yes');
      session.current ??= makeSession();
      await session.current.prepare(true, (amount, status) => { if (allowed() && epoch.current === version) { setProgress(Math.round(amount * 100)); setLoadStatus(status); } });
      if (allowed() && epoch.current === version) {
        localStorage.setItem(modelKeys.ready, 'yes'); localStorage.removeItem(modelKeys.loading);
        setPhase('ready'); refresh();
      }
    } catch (cause) { if (allowed() && epoch.current === version) { try { localStorage.removeItem(modelKeys.loading); } catch {} report(cause); void session.current?.dispose(); session.current = null; setPhase('idle'); } }
  }
  async function send(message?: string) {
    if (blocked || !allowed() || phase === 'loading' || phase === 'thinking' || (voiceOn && !message) || !(message ?? draft).trim()) return;
    if (message) stopVoice();
    const text = message ?? draft; const version = epoch.current; setError(''); setPhase('thinking'); voice.current?.stop(); setListening(false);
    try { localStorage.setItem(recoveryKey, text); session.current ??= makeSession(); await session.current.send(text, source); if (allowed() && version === epoch.current) { localStorage.removeItem(recoveryKey); setDraft(''); setSource('text'); setPhase(session.current.hasModel() ? 'ready' : 'idle'); refresh(); openDestination(); } }
    catch (cause) { if (allowed() && version === epoch.current) { report(cause); void session.current?.dispose(); session.current = null; setPhase('idle'); } }
    finally { if (allowed() && version === epoch.current) { try { refresh(); } catch (cause) { report(cause); } } }
  }
  function listen() {
    if (blocked || phase === 'loading' || phase === 'thinking') return;
    if (listening) { voice.current?.stop(); setListening(false); return; }
    stopVoice();
    if (!voiceApproved.current.dictation) { setVoiceConsent('dictation'); return; }
    startListening();
  }
  function startListening() {
    if (!allowed() || notice || exhausted || !data) return;
    stopVoice(); voiceApproved.current.dictation = true; setVoiceConsent(null); setError('');
    try { voice.current?.listen(true, text => { if (allowed()) { setDraft(previous => [previous.trim(), text.trim()].filter(Boolean).join(' ').slice(0, 1000)); setSource('voice'); setListening(false); } }, message => { if (allowed()) { setError(message); setListening(false); } }, () => { if (alive.current) setListening(false); }); setListening(true); }
    catch (cause) { report(cause); setListening(false); }
  }
  function toggleAssistant() {
    if (voiceOn) { stopVoice(); return; }
    if (blocked || phase === 'loading' || phase === 'thinking') return;
    stopVoice();
    if (!voiceApproved.current.assistant) { setVoiceConsent('assistant'); return; }
    startAssistant();
  }
  function startAssistant() {
    if (!allowed() || notice || exhausted || !data || !voice.current) return;
    stopVoice(); setVoiceConsent(null); setError(''); voiceApproved.current.assistant = true;
    // A previous dictation/read-aloud failure must not carry a stale recognizer into chat.
    voice.current.dispose();
    voice.current = new CuboAIVoice(allowed, () => readVoicePreference(localStorage, uid));
    const commands = new AssistantVoice(async text => {
      if (!allowed()) throw Error('Voice session ended.');
      session.current ??= makeSession();
      // Reuse saved-account presets and quota; NEVER start or invoke the optional model for voice.
      const reply = await session.current.send(text, 'voice', true);
      if (!allowed()) throw Error('Voice session ended.');
      refresh(); return destinations.current!.spokenChoices() ?? reply.content;
    });
    conversation.current = new DriveConversation(voice.current, allowed, async text => {
      try { const reply = await commands.answer(text); return { ...reply, stop: reply.stop || !!pendingDestination.current || (session.current?.state().used ?? 0) >= WEEKLY_REPLIES }; }
      catch (cause) { report(cause); return { text: 'Cubo Voice Assist is paused. Check the message in chat.', stop: true }; }
    }, (active, text) => { if (alive.current) { setVoiceOn(active); setVoiceStatus(active ? text : ''); if (!active && text !== 'Voice off') setError(text); if (!active && pendingDestination.current) openDestination(); } }, Date.now, { mode: 'chat', acceptsFollowUp: text => destinations.current!.acceptsFollowUp() || commands.acceptsFollowUp(text), readyForReply: () => commands.readyForReply() });
    conversation.current.start();
  }
  function acknowledge() {
    try { if (dontShow) localStorage.setItem(noticeKey, 'hidden'); setNotice(false); } catch (cause) { report(cause); }
  }
  const icon = (name: React.ComponentProps<typeof Ionicons>['name'], color = c.text) => <Ionicons name={name} size={22} color={color} />;
  return <div className="cubo-ai" style={{ '--ai-bg': c.background, '--ai-card': c.card, '--ai-composer': c.composerSurface, '--ai-message': c.messageSurface, '--ai-message-text': c.messageText, '--ai-feature': c.featureSurface, '--ai-feature-text': c.featureText, '--ai-text': c.text, '--ai-muted': c.textSecondary, '--ai-border': c.borderStrong, '--ai-accent': c.accent, '--ai-soft': c.accentSoft, '--ai-on': c.onAccent, '--ai-user-bubble': mode === 'dark' ? '#173B2C' : '#174B35', '--ai-user-text': '#F7FBF8', '--ai-assistant-bubble': mode === 'dark' ? '#22282A' : '#ECEFED', '--ai-ambient': mode === 'dark' ? 'rgba(99,207,147,.12)' : 'rgba(8,125,82,.09)' } as React.CSSProperties}>
    <style>{CSS + ASSISTANT_POLISH}</style>
    <header className="ai-header"><button aria-label="Back to Home" className="ai-icon" onClick={() => navigation.goBack()}>{icon('arrow-back', c.featureText)}</button><div className="ai-heading"><h1>Cubo Assistant</h1><p>Your drive, understood.</p></div><div className="ai-allowance" title="Local weekly allowance · resets Monday 00:00 UTC"><span className="ai-percent" style={{ background: badge.background, color: badge.foreground }} aria-label={`${badge.percent}% weekly allowance remaining`}>{badge.percent}%</span><small>remaining</small></div><button aria-label="Cubo Assistant settings" className="ai-icon" onClick={() => { setNotes(data?.memory ?? ''); setSettings(true); }}>{icon('ellipsis-horizontal', c.featureText)}</button></header>
    <section className="ai-companion" aria-labelledby="ai-companion-title">
      <div className="ai-droid-shell ai-droid-shell-compact" aria-hidden="true"><span className="ai-droid-orbit" /><div className="ai-droid"><Image source={require('../../assets/assistant/cubo-droid.png')} resizeMode="contain" style={{ width: 104, height: 104 }} /></div><span className="ai-droid-shadow" /></div>
      <div className="ai-companion-copy"><span className="ai-kicker">YOUR CUBO COMPANION</span><h2 id="ai-companion-title">What can we figure out together?</h2><p>Ask about your drive, your CUBO features, or safer habits.</p></div>
      <span className="ai-ready-dot" title="Cubo Assistant is ready" aria-hidden="true" />
    </section>
    <main className="ai-thread" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation">
      {!data?.messages.length && <div className="ai-welcome"><p>Try one of these to get started.</p><div className="ai-prompts">{['Explain my focus score', 'How does camera calibration work?', 'How can I build better driving habits?'].map(text => <button key={text} disabled={blocked} onClick={() => { setDraft(text); setSource('text'); }}><span>{text}</span>{icon('arrow-forward', c.accent)}</button>)}</div></div>}
      {data?.messages.map((message, index) => <article key={`${message.at}-${index}`} className={`ai-message ai-${message.role}`}><small>{message.role === 'user' ? message.source === 'voice' ? 'You · voice' : 'You' : 'Cubo Assistant'}</small><p>{message.content}</p>{message.role === 'assistant' && <button className="ai-read" style={{ minHeight: 44 }} aria-label={reading === index ? 'Stop reading reply' : 'Read reply aloud'} onClick={() => readReply(index, message.content)}>{icon(reading === index ? 'stop-circle-outline' : 'volume-medium-outline', c.accent)}<span>{reading === index ? 'Stop' : 'Listen'}</span></button>}</article>)}
      {phase === 'thinking' && <p role="status" className="ai-status"><span /><span /><span /><em>Cubo is thinking</em></p>}
      <div ref={end} />
    </main>
    <footer className="ai-footer">
      {activeSession && <p role="status">End your drive before using Cubo Assistant. Stay focused on the road.</p>}
      {error && <p role="alert" className="ai-error">{error}</p>}
      {!blocked && !voiceOn && phase === 'idle' && <details className="ai-load"><summary>General AI · optional</summary><p>Quick answers and address search work without it. Loading uses more memory and may crash Safari.</p><button className="ai-secondary" onClick={() => void load()}>Load general AI</button></details>}
      {!blocked && !voiceOn && phase === 'ready' && <button className="ai-secondary" onClick={() => { voice.current?.stop(); setListening(false); void session.current?.dispose().catch(() => {}); session.current = null; setPhase('idle'); }}>Stop general AI · use quick answers only</button>}
      {phase === 'loading' && <div role="status" className="ai-loading"><span>Preparing Cubo Assistant · {progress}%</span><progress max="100" value={progress} /><small>{loadStatus || 'Checking saved model files…'}</small></div>}
      {exhausted && <p role="status">Your weekly allowance is used. Resets {data ? new Date(data.week + 604800000).toLocaleString() : 'Monday'}.</p>}
      <div className="ai-voice-state" role="status">{voiceOn ? `Cubo Voice Assist · ${voiceStatus}` : null}</div>
      {mapConfirmation && <section className="ai-map-confirm" aria-label="Switch to Map confirmation"><strong>Switch to Map?</strong><p>{mapConfirmation.title}<br /><small>{mapConfirmation.subtitle}</small></p><p>Preview only. You choose when to start driving.</p><div><button className="ai-primary" disabled={phase === 'thinking'} onClick={() => void send('confirm')}>Switch to Map</button><button className="ai-secondary" disabled={phase === 'thinking'} onClick={() => void send('cancel')}>Stay here</button></div></section>}
      {!!destinationChoices.length && <div className="ai-destinations" aria-label="Choose a destination"><p>Check the full address · route preview only</p>{destinationChoices.map((place, index) => <button key={place.id} disabled={phase === 'thinking' || voiceOn} onClick={() => void send(`option ${index + 1}`)}><strong>{index + 1}. {place.title}</strong><small>{place.subtitle}</small></button>)}<small>{voiceOn ? 'Say option one, two, or three. Say cancel to dismiss.' : 'Choose a match, or type cancel.'}</small></div>}
      <div className="ai-composer"><textarea aria-label="Message Cubo Assistant" rows={2} maxLength={1000} disabled={blocked || voiceOn || phase === 'loading' || phase === 'thinking'} placeholder={exhausted ? 'Weekly usage done' : activeSession ? 'Available after your drive' : 'Ask about your CUBO app…'} value={draft} onChange={e => { setDraft(e.target.value); setSource('text'); }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} /><div className="ai-compose-actions"><button className="ai-icon ai-voice-toggle" title="Cubo Voice Assist · spoken conversation" aria-label={voiceOn ? 'Stop Cubo Voice Assist' : 'Start Cubo Voice Assist'} aria-pressed={voiceOn} disabled={!voiceOn && (blocked || phase === 'loading' || phase === 'thinking')} onClick={toggleAssistant}>{icon('pulse-outline', voiceOn ? c.onAccent : c.accent)}<span>Voice Assist</span></button><button className="ai-icon" title="Dictate into the text box" aria-label={listening ? 'Stop dictation' : 'Dictate message'} aria-pressed={listening} disabled={blocked || phase === 'loading' || phase === 'thinking'} onClick={listen}>{icon(listening ? 'stop-circle' : 'mic-outline', listening ? c.danger : c.accent)}</button><button className="ai-send" aria-label="Send message" disabled={blocked || voiceOn || phase === 'loading' || phase === 'thinking' || !draft.trim()} onClick={() => void send()}>{icon('arrow-up', c.onAccent)}</button></div></div>
      <small className="ai-caption">{listening ? 'Listening… tap stop when finished. Review your words before sending.' : voiceOn ? 'Spoken replies use your Voice Preference. Tap Voice Assist to stop.' : 'Mic: dictate · Voice Assist: spoken conversation.'}</small>
      <button className="ai-credit" onClick={() => { stopVoice(); setLicense(true); }}>Built with Llama · License</button>
    </footer>
    {notice && <div className="ai-scrim"><section className="ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-notice-title"><h2 id="ai-notice-title">Before you chat</h2>{error && <p role="alert" className="ai-error">{error}</p>}<p>Cubo Assistant is experimental and can make mistakes. It cannot certify safe driving, provide emergency help, or guarantee insurance savings. Only use it while parked.</p><p>Quick answers use saved app data without loading AI. Saved addresses and insurer preferences are read from your signed-in CUBO account for preset answers; bounded text replies and notes sync to that account and remain cached locally for offline access. Optional general AI receives only a limited account summary, saved notes and your current question—not saved addresses or prior chat history automatically. Address requests send the place you ask for and an approximate saved Home location bias to the public Photon search service. Choose a match to preview a route; this never starts a drive. Camera frames, plates and precise routes are excluded. Raw voice audio is never saved by CUBO.</p><p>100 attempts per week. Failed attempts count. Voice input may use your browser provider’s servers and asks separately.</p><label className="ai-check"><input type="checkbox" checked={dontShow} onChange={e => setDontShow(e.target.checked)} />Don’t show me this again on this browser</label><button autoFocus className="ai-primary" onClick={acknowledge}>Continue to Cubo Assistant</button><button className="ai-secondary" onClick={() => navigation.goBack()}>Go back</button></section></div>}
    {voiceConsent && <div className="ai-scrim"><section className="ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-voice-title"><h2 id="ai-voice-title">{voiceConsent === 'read' ? 'Interrupt read-aloud' : voiceConsent === 'assistant' ? 'Cubo Voice Assist' : 'Dictate a message'}</h2><p>Your browser may send audio to its speech-recognition provider. CUBO does not save raw audio.</p><p>{voiceConsent === 'read' ? 'Allow listening during playback so you can say “stop” or “stop talking”. No other commands are accepted during read-aloud. If your browser cannot listen and speak together, tap Stop. Listening ends when the reply ends.' : voiceConsent === 'assistant' ? 'While on, say Hey Cubo and your question. Questions are sent automatically and replies are spoken aloud using your Voice Preference. This uses saved app answers, not live-drive data or the optional AI model. Exchanges use your weekly allowance and stay in this account’s local chat history. Tap the waveform to stop. Use only while parked.' : 'Your words are added to the text box. Review or edit them, then press Send. Dictation never sends automatically.'}</p><button autoFocus className="ai-primary" onClick={voiceConsent === 'read' ? () => startRead(true) : voiceConsent === 'assistant' ? startAssistant : startListening}>{voiceConsent === 'read' ? 'Allow & listen' : voiceConsent === 'assistant' ? 'Start Cubo Voice Assist' : 'Start dictation'}</button>{voiceConsent === 'read' && <button className="ai-secondary" onClick={() => startRead(false)}>Listen without microphone</button>}<button className="ai-secondary" onClick={() => { pendingRead.current = null; setVoiceConsent(null); }}>Keep typing</button></section></div>}
    {license && <div className="ai-scrim"><section className="ai-dialog ai-license-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-license-title"><button autoFocus className="ai-secondary ai-license-back" onClick={() => setLicense(false)}>← Back to Cubo Assistant</button><h2 id="ai-license-title">Llama license</h2><p>Built with Llama. The optional general AI model uses Llama 3.2; saved-app quick answers do not run the model.</p>{licenseError ? <p role="alert">{licenseError}</p> : licenseText ? <pre className="ai-license-text">{licenseText}</pre> : <p role="status">Loading license…</p>}</section></div>}
    {settings && <div className="ai-scrim"><section className="ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title"><h2 id="ai-settings-title">Your Cubo Assistant</h2>{error && <p role="alert" className="ai-error">{error}</p>}<p>Account history: latest 200 messages, synced with a local offline copy. The weekly allowance resets Monday at 00:00 UTC; history and notes stay.</p><label>Notes you want Cubo Assistant to remember<textarea aria-label="Saved memory notes" rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label><button className="ai-primary" onClick={() => { try { session.current ??= makeSession(); session.current.remember(notes); refresh(); setSettings(false); } catch (cause) { report(cause); } }}>Save notes</button><button className="ai-secondary" onClick={() => { setSettings(false); setNotice(true); }}>Show safety notice</button><button className="ai-secondary" onClick={() => setClear(true)}>Clear history and notes</button>{clear && <><p>This deletes the synced chat history and notes for this account after the change reaches Firebase. Your weekly allowance will not reset. If corrupt data cannot be recovered, chat stays unavailable until next Monday.</p><button className="ai-secondary" onClick={() => { try { session.current ??= makeSession(); session.current.clearHistory(); localStorage.removeItem(recoveryKey); setDraft(''); setError(''); refresh(); setClear(false); setSettings(false); } catch (cause) { report(cause); } }}>Yes, clear them</button></>}<button autoFocus className="ai-secondary" onClick={() => { setSettings(false); setClear(false); }}>Close</button></section></div>}
    {(notice || voiceConsent || settings || license) && <ModalKeys returnTo={license ? '.ai-credit' : settings ? '[aria-label="Cubo Assistant settings"]' : voiceConsent === 'assistant' ? '.ai-voice-toggle' : voiceConsent ? '[aria-label="Dictate message"]' : '.ai-load button'} close={() => { if (notice) navigation.goBack(); else { setSettings(false); setVoiceConsent(null); setLicense(false); } }} />}
  </div>;
}
function ModalKeys({ close, returnTo }: { close: () => void; returnTo: string }) {
  useEffect(() => {
    return () => {
      queueMicrotask(() => {
        if (document.querySelector('.ai-dialog')) return;
        const target = document.querySelector<HTMLElement>(returnTo + ':not(:disabled)')
          ?? document.querySelector<HTMLElement>('.ai-composer textarea:not(:disabled)')
          ?? document.querySelector<HTMLElement>('.ai-header button');
        target?.focus();
      });
    };
  }, [returnTo]);
  useEffect(() => { const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') { const items = Array.from(document.querySelectorAll<HTMLElement>('.ai-dialog button, .ai-dialog input, .ai-dialog textarea')).filter(el => !el.hasAttribute('disabled')); const first = items[0], last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }; document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler); }, [close]); return null;
}
const ASSISTANT_POLISH = `
.cubo-ai:before{content:"";position:absolute;inset:0 0 auto 0;height:52%;pointer-events:none;background:radial-gradient(circle at 70% 8%,var(--ai-ambient),transparent 48%),radial-gradient(circle at 4% 42%,rgba(117,96,127,.08),transparent 40%)}
.ai-header{position:relative;z-index:2;padding:18px 14px 20px;border:0;background:var(--ai-feature);border-radius:0 0 26px 26px;box-shadow:0 12px 34px rgba(0,20,12,.12)}
.ai-header .ai-icon{background:rgba(255,255,255,.07)}.ai-heading h1{font-size:22px}.ai-heading p{margin-top:5px}
.ai-companion{position:relative;z-index:2;display:flex;align-items:center;gap:14px;margin:14px 16px 4px;padding:13px 16px 13px 10px;min-height:132px;border:1px solid color-mix(in srgb,var(--ai-accent) 18%,transparent);border-radius:26px 26px 26px 10px;background:linear-gradient(135deg,var(--ai-card),color-mix(in srgb,var(--ai-soft) 64%,var(--ai-card)));box-shadow:0 12px 32px rgba(0,20,12,.09);overflow:hidden;animation:ai-companion-in .46s cubic-bezier(.22,.8,.24,1) both}.ai-companion:after{content:"";position:absolute;right:-34px;bottom:-58px;width:140px;height:140px;border-radius:50%;background:radial-gradient(circle,var(--ai-ambient),transparent 70%);pointer-events:none}.ai-companion-copy{position:relative;z-index:2;min-width:0;flex:1}.ai-companion h2{max-width:230px;margin:0;font:24px/1.14 Manrope_800ExtraBold;letter-spacing:-.55px}.ai-companion p{margin:8px 0 0;color:var(--ai-muted);font-size:12px;line-height:1.45}.ai-kicker{display:inline-block;color:var(--ai-accent);font:9px Manrope_800ExtraBold;letter-spacing:1.3px;margin-bottom:7px}.ai-ready-dot{position:absolute;right:14px;top:14px;width:8px;height:8px;border-radius:50%;background:var(--ai-accent);box-shadow:0 0 0 5px var(--ai-ambient);animation:ai-ready 2.2s ease-in-out infinite}
.ai-thread{position:relative;z-index:1;padding:20px 20px 44px}
.ai-welcome{position:relative;padding:2px 2px 30px;text-align:left}.ai-welcome>p{margin:0;color:var(--ai-muted);font-size:13px;line-height:1.5}
.ai-droid-shell{position:relative;width:154px;height:146px;margin:0 auto 2px;display:flex;align-items:center;justify-content:center}.ai-droid{position:relative;z-index:2;animation:ai-float 4.2s ease-in-out infinite;filter:drop-shadow(0 16px 20px rgba(0,20,12,.18))}.ai-droid-orbit{position:absolute;width:118px;height:118px;border-radius:50%;background:radial-gradient(circle,var(--ai-ambient),transparent 70%);animation:ai-breathe 3.4s ease-in-out infinite}.ai-droid-shadow{position:absolute;left:50%;bottom:7px;width:66px;height:10px;border-radius:50%;background:rgba(0,0,0,.16);filter:blur(5px);transform:translateX(-50%);animation:ai-shadow 4.2s ease-in-out infinite}
.ai-droid-shell-compact{flex:0 0 108px;width:108px;height:104px;margin:0}.ai-droid-shell-compact .ai-droid-orbit{width:94px;height:94px}.ai-droid-shell-compact .ai-droid-shadow{bottom:0;width:54px}
.ai-prompts{gap:10px;margin-top:26px}.ai-prompts button{min-height:58px;padding:15px 16px;border:0;border-radius:19px 19px 19px 8px;background:var(--ai-card);box-shadow:0 7px 20px rgba(0,20,12,.06);transition:transform .18s ease,background .18s ease}.ai-prompts button:hover{transform:translateY(-1px);background:var(--ai-soft)}
.ai-message{max-width:86%;margin-bottom:22px;animation:ai-message-in .36s cubic-bezier(.22,.8,.24,1) both}.ai-message p{font-size:15px;line-height:1.62;margin:8px 0 0}.ai-user{padding:14px 16px;border:0;border-radius:22px 22px 7px 22px;background:var(--ai-user-bubble);color:var(--ai-user-text);box-shadow:0 8px 22px rgba(0,35,20,.14)}.ai-user>small{color:rgba(255,255,255,.68)}.ai-assistant{padding:15px 16px;border-radius:22px 22px 22px 7px;background:var(--ai-assistant-bubble);box-shadow:0 8px 22px rgba(0,20,12,.07)}.ai-assistant>small{color:var(--ai-accent)}.ai-read{margin-top:4px;padding:0 4px}
.ai-status{width:max-content;max-width:80%;min-height:46px;margin:4px 0 22px;padding:12px 15px;border-radius:20px 20px 20px 7px;background:var(--ai-assistant-bubble);display:flex;align-items:center;gap:5px}.ai-status span{width:6px;height:6px;border-radius:50%;background:var(--ai-accent);animation:ai-dot 1.15s ease-in-out infinite}.ai-status span:nth-child(2){animation-delay:.13s}.ai-status span:nth-child(3){animation-delay:.26s}.ai-status em{font-style:normal;font-size:12px;margin-left:5px}
.ai-footer{position:relative;z-index:3;padding:14px 16px max(14px,env(safe-area-inset-bottom));border:0;border-radius:28px 28px 0 0;background:var(--ai-card);box-shadow:0 -14px 36px rgba(0,20,12,.10)}
.ai-composer{padding:11px;border-radius:24px;border-color:transparent;box-shadow:0 8px 26px rgba(0,0,0,.11);transition:border-color .18s ease,box-shadow .18s ease}.ai-composer:focus-within{box-shadow:0 10px 30px rgba(0,40,22,.15)}
.ai-composer textarea{padding:10px;font-size:16px;line-height:1.5}.ai-compose-actions{margin-top:4px;gap:6px}.ai-voice-toggle{border:0!important;border-radius:16px}
@keyframes ai-companion-in{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes ai-ready{0%,100%{opacity:.65;transform:scale(.9)}50%{opacity:1;transform:scale(1.08)}}@keyframes ai-float{0%,100%{transform:translateY(1px) rotate(-1deg)}50%{transform:translateY(-7px) rotate(1deg)}}@keyframes ai-shadow{0%,100%{opacity:.17;transform:translateX(-50%) scale(1)}50%{opacity:.09;transform:translateX(-50%) scale(.78)}}@keyframes ai-breathe{0%,100%{opacity:.55;transform:scale(.92)}50%{opacity:1;transform:scale(1.08)}}@keyframes ai-message-in{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes ai-dot{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
@media(prefers-reduced-motion:reduce){.ai-companion,.ai-ready-dot,.ai-droid,.ai-droid-orbit,.ai-droid-shadow,.ai-message,.ai-status span{animation:none!important}.ai-prompts button{transition:none}}
@media(max-width:360px){.ai-companion{gap:9px;margin-left:12px;margin-right:12px;padding-left:6px}.ai-companion h2{font-size:21px}.ai-companion p{display:none}.ai-droid-shell-compact{flex-basis:96px;width:96px}.ai-thread{padding:18px 15px 34px}.ai-message{max-width:92%}.ai-footer{padding-left:12px;padding-right:12px}}
`;
const CSS = `
.cubo-ai{position:relative;height:100%;min-height:0;display:flex;flex-direction:column;background:var(--ai-bg);color:var(--ai-text);font-family:Manrope_400Regular,sans-serif;overflow:hidden}.cubo-ai *{box-sizing:border-box}.cubo-ai button,.cubo-ai textarea,.cubo-ai input{font:inherit}.cubo-ai button{cursor:pointer}.cubo-ai button:disabled{opacity:.45;cursor:default}.cubo-ai button:focus-visible,.cubo-ai textarea:focus-visible,.cubo-ai a:focus-visible{outline:2px solid var(--ai-accent);outline-offset:3px}.cubo-ai button{border:0}.ai-header{display:flex;align-items:center;gap:8px;padding:16px 12px;border-bottom:1px solid var(--ai-border);padding-top:max(16px,env(safe-area-inset-top))}.ai-heading{flex:1;min-width:0}.ai-heading h1{letter-spacing:-.4px;font:20px Manrope_800ExtraBold;margin:0}.ai-heading p{font-size:12px;color:var(--ai-muted);margin:4px 0 0}.ai-icon{width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:transparent;border-radius:50%;flex-shrink:0}.ai-percent{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:14px Manrope_800ExtraBold;font-variant-numeric:tabular-nums}.ai-allowance{display:flex;flex-direction:column;align-items:center;gap:4px}.ai-allowance small{font-size:10px;color:var(--ai-muted)}.ai-thread{flex:1;overflow-y:auto;min-height:0;padding:24px 20px;overscroll-behavior:contain}.ai-welcome{padding:24px 4px}.ai-welcome h2{font:28px/1.25 Manrope_800ExtraBold;margin:20px 0 12px}.ai-welcome p,.ai-dialog p{font-size:14px;line-height:1.65;color:var(--ai-muted)}.ai-prompts{display:grid;gap:8px;margin-top:28px}.ai-prompts button{display:flex;align-items:center;justify-content:space-between;text-align:left;gap:16px;min-height:52px;padding:12px 16px;background:var(--ai-card);border:1px solid var(--ai-border);border-radius:16px;color:var(--ai-text);font-size:14px}.ai-message{margin:0 0 24px;max-width:92%;overflow-wrap:anywhere}.ai-message small{font:12px Manrope_700Bold;color:var(--ai-muted)}.ai-message p{white-space:pre-wrap;font-size:15px;line-height:1.7;margin:8px 0}.ai-user{margin-left:auto;border-radius:20px 20px 4px 20px;background:var(--ai-message);color:var(--ai-message-text);border:1px solid var(--ai-border);padding:14px 16px}.ai-assistant{margin-right:auto;padding:4px 0}.ai-assistant>small{color:var(--ai-accent)}.ai-user>small{color:var(--ai-message-text)}.ai-read{display:flex;align-items:center;gap:8px;min-height:44px;background:none;color:var(--ai-accent);font-size:12px}.ai-footer{padding:12px 16px max(12px,env(safe-area-inset-bottom));border-top:1px solid var(--ai-border);background:var(--ai-bg)}.ai-footer p{font-size:12px;line-height:1.5;margin:0 0 8px}.ai-composer{display:flex;align-items:flex-end;gap:4px;border:1px solid var(--ai-border);border-radius:24px;background:var(--ai-composer);padding:10px;box-shadow:0 8px 24px rgba(0,20,12,.10)}.ai-composer textarea{flex:1;min-width:0;border:0;background:none;color:var(--ai-text);padding:8px;font-size:16px;line-height:1.5;resize:none;max-height:120px}.ai-composer textarea::placeholder{color:var(--ai-muted)}.ai-compose-actions{display:flex;align-items:center}.ai-voice-toggle[aria-pressed=true]{background:var(--ai-accent)}.ai-voice-state{font-size:12px;line-height:1.5;color:var(--ai-muted);max-height:72px;overflow:auto;margin-bottom:6px}.ai-voice-state:empty{display:none}.ai-license-back{position:sticky;top:0;z-index:1;margin:0 0 16px;background:var(--ai-card);border:1px solid var(--ai-border)!important}.ai-license-text{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 monospace}.ai-composer{flex-wrap:wrap}.ai-compose-actions{width:100%;gap:4px}.ai-voice-toggle{background:var(--ai-soft);border:1px solid var(--ai-border)!important;width:auto;padding:0 12px;gap:7px;border-radius:14px;margin-right:auto;color:var(--ai-accent);font-size:12px!important}.ai-voice-toggle[aria-pressed=true]{color:var(--ai-on);border-color:var(--ai-accent)!important}.ai-composer:focus-within{border-color:var(--ai-accent)}.cubo-ai ::selection{background:var(--ai-accent);color:var(--ai-on)}.ai-composer textarea{caret-color:var(--ai-accent)}.ai-thread{scrollbar-color:var(--ai-border) transparent;scrollbar-width:thin}.ai-header{background:var(--ai-feature);color:var(--ai-feature-text)}.ai-heading p,.ai-header .ai-allowance small{color:#C8DCD7}.ai-destinations{max-height:200px;overflow:auto;margin-bottom:8px}.ai-destinations button{display:block;text-align:left;width:100%;padding:12px;margin-bottom:6px;border-radius:12px;background:var(--ai-soft);color:var(--ai-text)}.ai-destinations small{display:block;font-size:11px;line-height:1.5;color:var(--ai-muted)}.ai-load summary{cursor:pointer;font-size:12px;color:var(--ai-muted);min-height:32px;display:list-item;padding:8px 0}.ai-load .ai-secondary{width:auto;font-size:12px;min-height:44px;padding:8px 12px}.ai-composer textarea{flex-basis:100%}.ai-send{width:44px;height:44px;border-radius:50%;background:var(--ai-accent);display:flex;align-items:center;justify-content:center}.ai-caption{display:block;font-size:10px;text-align:center;color:var(--ai-muted);margin-top:8px}.cubo-ai .ai-credit{display:block;width:fit-content;max-width:100%;background:transparent;min-height:28px;padding:4px 8px;text-decoration:underline;text-align:center;color:var(--ai-muted);font:9px/1.3 Manrope_400Regular,sans-serif;margin:2px auto 0;text-underline-offset:2px}.ai-map-confirm{padding:12px;border:1px solid var(--ai-border);border-radius:16px;margin-bottom:8px;background:var(--ai-card)}.ai-map-confirm strong{font-size:14px}.ai-map-confirm p{margin:8px 0}.ai-map-confirm small{color:var(--ai-muted)}.ai-map-confirm>div{display:flex;gap:8px}.ai-map-confirm button{margin:0;min-height:44px;padding:8px;font-size:12px}.ai-primary,.ai-secondary{width:100%;min-height:48px;border-radius:14px;padding:12px 16px;font-family:Manrope_700Bold!important}.ai-primary{background:var(--ai-accent);color:var(--ai-on)}.ai-secondary{background:var(--ai-soft);color:var(--ai-text);margin-top:8px}.ai-load{margin-bottom:12px}.ai-load p{color:var(--ai-muted)}.ai-loading{display:grid;gap:8px;font-size:12px;padding-bottom:12px}.ai-loading progress{width:100%;accent-color:var(--ai-accent)}.ai-error{color:var(--ai-text);border:1px solid #BD2929;border-radius:12px;padding:8px}.ai-status{font-size:14px;color:var(--ai-muted)}.ai-scrim{position:absolute;inset:0;z-index:10;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px}.ai-dialog{background:var(--ai-card);color:var(--ai-text);border-radius:24px;padding:24px;width:100%;max-width:440px;max-height:90%;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.2)}.ai-dialog h2{font:24px Manrope_800ExtraBold;margin:0 0 16px}.ai-dialog label{font-size:14px}.ai-check{display:flex;align-items:center;gap:12px;min-height:48px;margin:16px 0}.ai-check input{width:20px;height:20px;accent-color:var(--ai-accent)}.ai-dialog textarea{width:100%;margin:8px 0 16px;border-radius:12px;border:1px solid var(--ai-border);background:var(--ai-bg);color:var(--ai-text);padding:12px;resize:vertical;font-size:16px}@media(max-width:360px){.ai-header{gap:4px;padding-left:8px;padding-right:8px}.ai-heading p{font-size:10px}.ai-thread{padding:16px}.ai-dialog{padding:20px}.ai-compose-actions{gap:0}}`;
