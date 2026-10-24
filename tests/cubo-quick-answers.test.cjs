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
const { CuboAISession } = load('src/features/cuboAI/session.ts');
const { accountAnswer } = load('src/features/cuboAI/accountAnswers.ts');
const facts = { name: 'Alice Example', selectedVehicle: '2021 Toyota Prius', vehicleCount: 1, averageFocusOutOf100: 83, completedTrips: 4, savedMiles: '25.2', calibration: 'completed' };
const details = { ready: true, home: 'PRIVATE HOME', work: 'PRIVATE WORK', insurer: 'Example Insurer', mode: 'manual', cadence: 'monthly', blockedAppsReady: true, blockedAppsEnabled: true, blockedAppNames: ['Instagram', 'Facebook', 'Telegram'], childLock: false };
const corpus = [
  ['what is my score', /83\/100/], ['explain my focus score', /83\/100/], ['how good is my attention rating', /83\/100/],
  ['how can I improve my score', /Set your route/], ['why is my focus unavailable', /measurements/],
  ['what insurance do I have', /Example Insurer/], ['which insurer is selected', /Example Insurer/], ['how much can I save on premiums', /illustration/],
  ['submit my insurance report', /nothing is sent/], ['automatic insurance reporting', /manual, monthly/],
  ['who are my kids', /real linked accounts/], ['name my children', /real linked accounts/], ['list my family members', /real linked accounts/],
  ['child1 safety score', /does not invent or expose unshared/], ['what is child two rating', /completed measured drives/], ['parent score', /completed measured drives/],
  ['where is my child', /foreground location snapshot/], ['how many miles did child 1 drive', /real linked accounts/], ['invite my partner', /not sent/],
  ['what is my vehicle selected', /Toyota Prius/], ['what car do I own', /Toyota Prius/], ['tell me about my car', /Toyota Prius/],
  ['whats my vehicel', /Toyota Prius/], ['change my selected vehicle', /have not changed/], ['change my car color', /pencil/],
  ['is my car safe', /no vehicle diagnostics/], ['how do I add a vehicle', /Manage vehicles/],
  ['what is my home address', /PRIVATE HOME/], ['where do I work', /PRIVATE WORK/], ['change my address', /not changed/],
  ['what is my name', /Alice Example/], ['who am I', /Alice Example/], ['change my password', /not changed/], ['what is my phone number', /does not have/],
  ['how many trips do I have', /4 completed/], ['what is my mileage', /25.2/], ['delete my trip history', /not deleted/],
  ['how do I calibrate the camera', /While parked/], ['is my calibration done', /completed/], ['my camera is black', /permission/],
  ['how does the camera distraction test work', /audible attention alert/], ['allow camera microphone and location access', /Account > Preferences/],
  ['what apps are blocked', /Instagram, Facebook, Telegram/], ['what is Child Lock', /family organizer/],
  ['can I block Facebook and Telegram', /Facebook and Telegram are available/], ['turn off blocked apps', /returns automatically/],
  ['does blocked apps actually block my phone apps', /not active yet/], ['how do I invite someone to CUBO', /Account > Support > Invite someone/],
  ['what road do I turn onto next', /will not guess/], ['what is my eta', /no live route/], ['how do I switch map source', /Cloudflare/],
  ['what is my speed in mph', /speedometer/], ['report debris here', /not submitted/], ['is my microphone on', /not always listening/],
  ['why does the model crash', /can still crash Safari/], ['change dark mode', /Account/], ['can I connect bluetooth devices', /disabled/],
  ['what can you do', /Quick answers/], ['my car accident', /emergency/], ['what are my secret details', /not connected/],
];
test('common and newly added feature phrasings produce relevant presets with fresh supplied facts', () => {
  for (const [q, expected] of corpus) assert.match(accountAnswer(q, JSON.stringify(facts), details), expected, q);
});
test('all presets work without model load or GPU, including unknown questions', async () => {
  const map = new Map(); const store = { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) };
  let uid = 'alice';
  const session = new CuboAISession({ uid, currentUid: () => uid, isDriving: () => false, store,
    appContext: () => JSON.stringify(facts), localDetails: () => details, loadModel: async () => assert.fail('Must not load a model') });
  for (const [q, expected] of corpus) assert.match((await session.send(q)).content, expected, q);
  assert.match((await session.send('something completely unfamiliar')).content, /could not confidently match/);
  uid = 'bob'; await assert.rejects(session.send('what is my home address'), /account changed/);
});
test('malformed or missing data never invents a score, name, address or policy', () => {
  assert.doesNotMatch(accountAnswer('what is my email address', '{}', details), /PRIVATE HOME|PRIVATE WORK/);
  assert.match(accountAnswer('turn off the microphone', '{}'), /dictate/);
  for (const value of ['{', 'null', '[]', '{}']) {
    assert.match(accountAnswer('my score', value), /still loading/i);
    assert.match(accountAnswer('my name', value), /unavailable/);
    assert.match(accountAnswer('my address', value), /loading or unavailable/);
  }
  assert.match(accountAnswer('my home address', '{}', { ready: true }), /No Home address/);
  assert.match(accountAnswer('my work address', '{}', { ready: true }), /No Work address/);
});
test('timed-out general AI is disposed and presets remain usable; no automatic retry', async () => {
  let disposed = 0, calls = 0; const map = new Map();
  const session = new CuboAISession({ uid: 'a', currentUid: () => 'a', isDriving: () => false, replyTimeoutMs: 5,
    store: { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) },
    loadModel: async () => ({ reply: () => { calls++; return new Promise(() => {}); }, dispose: () => { disposed++; } }) });
  await session.prepare(true);
  assert.match((await session.send('Explain astronomy')).content, /General AI could not finish/);
  assert.match((await session.send('who are my kids')).content, /real linked accounts/);
  await session.send('Explain astronomy'); assert.equal(calls, 1); assert.equal(disposed, 1);
});
test('saved address replies never enter general model context', async () => {
  const map = new Map(); let prompt;
  const session = new CuboAISession({ uid: 'a', currentUid: () => 'a', isDriving: () => false,
    localDetails: () => details, store: { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) },
    loadModel: async () => ({ reply: async messages => { prompt = JSON.stringify(messages); return 'Answer'; }, dispose() {} }) });
  await session.send('my home address'); await session.prepare(true); await session.send('Explain astronomy');
  assert.doesNotMatch(prompt, /PRIVATE HOME|PRIVATE WORK|Example Insurer/);
});
test('screen never auto-loads model and allows composer in idle quick-answer mode', () => {
  const source = fs.readFileSync('src/screens/CuboAIScreen.web.tsx', 'utf8');
  assert.doesNotMatch(source, /autoAttempted|phase !== 'ready'/);
  assert.match(source, /className="ai-menu"/);
  assert.match(source, /'Load General AI'/);
  assert.doesNotMatch(source, /className="ai-load"/);
  assert.match(source, /maxLength=\{1000\}/);
});
