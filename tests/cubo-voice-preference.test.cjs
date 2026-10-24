const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const m = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('module', 'exports', 'require', code)(m, m.exports, n => load(path.resolve(path.dirname(file), n + '.ts')));
  return m.exports;
}
test('voice preference persists per account and supports default and blocked storage', () => {
  const { readVoicePreference, writeVoicePreference } = load('src/features/cuboAI/voicePreference.ts');
  const values = new Map(); const store = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  writeVoicePreference(store, 'alice', 'voice-a');
  assert.equal(readVoicePreference(store, 'alice'), 'voice-a'); assert.equal(readVoicePreference(store, 'bob'), '');
  writeVoicePreference(store, 'alice', ''); assert.equal(readVoicePreference(store, 'alice'), '');
  assert.equal(readVoicePreference({ getItem() { throw Error('blocked'); } }, 'alice'), '');
});
test('voice selector keeps at most six clear English voices and removes novelty voices', () => {
  const { recommendedEnglishVoices, voiceDisplayName } = load('src/features/cuboAI/voicePreference.ts');
  const voice = (name, lang, voiceURI = name, localService = true) => ({ name, lang, voiceURI, localService });
  const choices = recommendedEnglishVoices([
    voice('Zarvox', 'en-US'), voice('Samantha', 'en-US'), voice('Daniel', 'en-GB'), voice('Karen', 'en-AU'),
    voice('Ava', 'en-US'), voice('Moira', 'en-IE'), voice('Tessa', 'en-ZA'), voice('Google français', 'fr-FR'),
    voice('Microsoft Aria Online (Natural)', 'en-US', 'aria', false), voice('Extra English', 'en-CA'),
  ]);
  assert.equal(choices.length, 6);
  assert.equal(choices.some(item => item.name === 'Zarvox'), false);
  assert.equal(choices.some(item => item.lang === 'fr-FR'), false);
  assert.match(voiceDisplayName(choices[0]), /English/);
});
test('Listen chooses preferred voice each time and falls back if unavailable', () => {
  const { CuboAIVoice } = load('src/features/cuboAI/browserVoice.ts');
  const oldWindow = global.window, oldUtterance = global.SpeechSynthesisUtterance;
  let spoken, preferred = 'voice-a';
  const a = { voiceURI: 'voice-a', lang: 'en-GB' }, b = { voiceURI: 'voice-b', lang: 'en-US' };
  global.window = { speechSynthesis: { getVoices: () => [a,b], cancel() {}, speak: u => { spoken = u; } } };
  global.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  try {
    const voice = new CuboAIVoice(() => true, () => preferred);
    voice.speak('This is Cubo.'); assert.equal(spoken.text, 'This is Cubo.'); assert.equal(spoken.voice, a); assert.equal(spoken.lang, 'en-GB');
    preferred = 'voice-b'; voice.speak('Hello'); assert.equal(spoken.voice, b);
    preferred = 'gone'; voice.speak('Hello'); assert.equal(spoken.voice, undefined); assert.equal(spoken.lang, 'en-US');
    voice.dispose(); assert.throws(() => voice.speak('Hello'), /unavailable/);
  } finally { global.window = oldWindow; global.SpeechSynthesisUtterance = oldUtterance; }
});
test('voice dropdown follows media access and listens for delayed browser voices', () => {
  const profile = fs.readFileSync('src/screens/ProfileScreen.tsx', 'utf8');
  assert.match(profile, /<MediaAccessPreference \/>\s*<VoicePreference \/>/);
  assert.doesNotMatch(profile, /MapSourcePreference/);
  const component = fs.readFileSync('src/components/VoicePreference.web.tsx', 'utf8');
  assert.match(component, /addEventListener\('voiceschanged', refresh\)/);
  assert.match(component, /removeEventListener\('voiceschanged', refresh\)/);
  assert.match(component, /key=\{user.uid\}/);
  assert.match(component, /aria-label="Voice Preference"/);
  assert.match(component, /Hear Voice/);
  assert.match(component, /speak\('This is Cubo\.'\)/);
  assert.match(component, /recommendedEnglishVoices/);
  assert.match(component, /Showing \$\{voices\.length\} clear English/);
  assert.match(component, /\[focused, activeSession\?\.id\]/);
  assert.match(component, /preview.current\?\.dispose\(\)/);
});
