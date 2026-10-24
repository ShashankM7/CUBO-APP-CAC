import { selectedVoice } from './voicePreference';
import { normalizeQuestion } from './quickAnswers';
import { isSilenceRequest } from './appAnswers';

export function isVoiceInterruption(text: string, spoken: string) {
  const q = normalizeQuestion(text);
  // Never execute commands or confirmations from recognition running alongside TTS.
  // Only a deliberate stop phrase can interrupt; ignore a phrase present in our own audio.
  return isSilenceRequest(q)
    && !normalizeQuestion(spoken).includes(q);
}
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function isRecoverableMicrophoneFailure(message: string) {
  return /no-speech|audio-capture|not-allowed|service-not-allowed|microphone|speech access|recognition unavailable|repeatedly interrupted/i.test(message);
}

/** Push-to-talk only. Transcript is returned to the composer, never submitted automatically. */
export class CuboAIVoice {
  private recognition: Recognition | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private utterance: SpeechSynthesisUtterance | null = null;
  private interruptRecognition: Recognition | null = null;
  private interruptTimer: ReturnType<typeof setTimeout> | null = null;
  private interruptionUnavailable = false;
  constructor(private allowed: () => boolean, private preferredVoice: () => string = () => '') {}
  supported() {
    if (typeof window === 'undefined') return { input: false, output: false };
    const browser = window as SpeechWindow;
    return { input: Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition), output: 'speechSynthesis' in browser };
  }
  listen(consentedToProviderProcessing: boolean, transcript: (text: string) => void, error: (message: string) => void, ended: () => void = () => {}) {
    if (this.disposed || !this.allowed()) throw Error('Voice is unavailable for this session.');
    if (!consentedToProviderProcessing) throw Error('Voice recognition may send audio to your browser provider. Confirm before enabling it.');
    this.stop();
    const browser = window as SpeechWindow;
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) throw Error('Voice input is not supported here. Type your message instead.');
    const recognition = new Constructor(); this.recognition = recognition;
    recognition.lang = 'en-US'; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = event => {
      const text = (event.results[0]?.[0]?.transcript ?? '').slice(0, 2000);
      this.stop();
      if (!this.disposed && this.allowed()) transcript(text);
      ended();
    };
    recognition.onerror = event => {
      // Release this recognizer BEFORE callbacks can schedule a replacement.
      this.stop();
      if (!this.disposed && this.allowed()) error(event.error === 'audio-capture'
        ? 'Microphone could not start (audio-capture). Close other mic apps and check Account → Camera & microphone access. You can type instead.'
        : event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone or speech access is blocked. Allow it in your browser settings. You can type instead.'
          : `Voice input stopped (${event.error}). You can type instead.`);
      ended();
    };
    recognition.onend = () => {
      this.stop();
      if (!this.disposed && this.allowed()) error('Voice input stopped (no-speech). Check microphone access and try again.');
      ended();
    };
    try { recognition.start(); } catch (cause) { this.stop(); throw cause; }
    this.timer = setTimeout(() => {
      this.stop();
      if (!this.disposed && this.allowed()) error('Voice input stopped (no-speech). Check microphone access and try again.');
      ended();
    }, 30000);
  }
  speak(text: string, completed?: () => void, failed?: () => void) {
    if (this.disposed || !this.allowed()) throw Error('Voice is unavailable for this session.');
    this.stop();
    if (!this.supported().output) throw Error('Read-aloud is not supported here.');
    // Drive activation speaks from the initial tap; subsequent replies reuse that session.
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 8000));
    this.utterance = utterance;
    const finish = (callback?: () => void) => {
      if (this.utterance !== utterance) return;
      if (this.timer) clearTimeout(this.timer); this.timer = null;
      this.utterance = null;
      utterance.onstart = null; utterance.onend = null; utterance.onerror = null;
      this.stopInterrupt();
      if (!this.disposed && this.allowed()) callback?.();
    };
    const timeout = () => { this.stop(); if (!this.disposed && this.allowed()) failed?.(); };
    utterance.onend = () => finish(completed);
    utterance.onerror = () => finish(failed);
    if (failed) {
      this.timer = setTimeout(timeout, 10000);
      utterance.onstart = () => { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(timeout, 60000); };
    }
    let preference = '';
    try { preference = this.preferredVoice(); } catch { /* Storage blocked: use browser default. */ }
    const voice = selectedVoice(window.speechSynthesis.getVoices(), preference);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'en-US'; utterance.volume = 1; utterance.rate = 1;
    window.speechSynthesis.resume?.(); window.speechSynthesis.speak(utterance);
  }
  /** Best-effort foreground barge-in. Some Safari versions disallow simultaneous TTS/recognition. */
  watchInterrupt(spoken: string, interrupted: () => void) {
    if (!this.utterance || this.disposed || !this.allowed() || this.interruptionUnavailable) return;
    const browser = window as SpeechWindow;
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) return;
    // Try once on every browser, including iOS. If capture conflicts with playback,
    // disable barge-in for this voice instance rather than repeatedly grabbing audio.
    this.stopInterrupt();
    const expected = this.utterance;
    let restarts = 0;
    const start = () => {
      if (this.utterance !== expected || this.disposed || !this.allowed()) return;
      const recognition = new Constructor(); this.interruptRecognition = recognition;
      recognition.lang = 'en-US'; recognition.continuous = false; recognition.interimResults = true;
      let accepted = false;
      const cleanup = () => { recognition.onresult = null; recognition.onend = null; recognition.onerror = null; try { recognition.abort(); } catch {} if (this.interruptRecognition === recognition) this.interruptRecognition = null; };
      recognition.onresult = event => {
        const text = event.results[event.results.length - 1]?.[0]?.transcript ?? '';
        if (!accepted && this.utterance === expected && isVoiceInterruption(text, spoken)) { accepted = true; cleanup(); interrupted(); }
      };
      recognition.onerror = () => { this.interruptionUnavailable = true; cleanup(); };
      recognition.onend = () => { cleanup(); if (!accepted && this.utterance === expected && restarts++ < 2) this.interruptTimer = setTimeout(start, 800); };
      try { recognition.start(); } catch { this.interruptionUnavailable = true; cleanup(); }
    };
    // Avoid Safari's just-aborted recognition instance racing the next start.
    this.interruptTimer = setTimeout(start, 350);
  }
  private stopInterrupt() {
    if (this.interruptTimer) clearTimeout(this.interruptTimer); this.interruptTimer = null;
    const interrupt = this.interruptRecognition; this.interruptRecognition = null;
    if (interrupt) { interrupt.onresult = null; interrupt.onerror = null; interrupt.onend = null; try { interrupt.abort(); } catch {} }
  }
  stop() {
    this.stopInterrupt();
    if (this.utterance) { this.utterance.onstart = null; this.utterance.onend = null; this.utterance.onerror = null; this.utterance = null; }
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    const recognition = this.recognition; this.recognition = null;
    if (recognition) { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.abort(); }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }
  dispose() { this.disposed = true; this.stop(); }
}
