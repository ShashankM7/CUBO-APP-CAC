const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loader() {
  const modules = new Map();
  return function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const m = { exports: {} };
    new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports, n => load(path.resolve(path.dirname(file), n + '.ts')));
    modules.set(file, m.exports); return m.exports;
  };
}
test('search preserves provider relevance, removes hard geographic exclusion, caches and validates coordinates', async () => {
  const { searchPlaces } = loader()('src/features/places/searchPlaces.ts');
  const previous = global.fetch; let calls = 0;
  global.fetch = async url => {
    calls++; const params = new URL(url).searchParams;
    assert.equal(params.has('bbox'), false); assert.equal(params.get('q'), 'Central Library');
    return { ok: true, json: async () => ({ features: [
      { geometry: { coordinates: [-78.8, 35.8] }, properties: { name: 'Central Library' } },
      { geometry: { coordinates: [-78.64, 35.78] }, properties: { name: 'Other Library' } },
      { geometry: { coordinates: [999, 0] }, properties: {} },
    ] }) };
  };
  try {
    const origin = { latitude: 35.78, longitude: -78.64 };
    const first = await searchPlaces(' Central   Library ', origin);
    assert.equal(first[0].title, 'Central Library'); assert.equal(first.length, 2);
    first[0].title = 'mutated';
    assert.equal((await searchPlaces('central library', origin))[0].title, 'Central Library');
    assert.equal(calls, 1);
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(searchPlaces('central library', origin, cancelled.signal), { name: 'AbortError' });
  } finally { global.fetch = previous; }
});
test('typed and voice destination variants require explicit place selection, never start a drive', async () => {
  const { AssistantDestination, destinationQuery } = loader()('src/features/cuboAI/assistantDestination.ts');
  for (const question of ['Hey Cubo set the address to Central Library', 'could you take me to Central Library please', 'navigate to Central Library']) assert.equal(destinationQuery(question), 'central library');
  assert.equal(destinationQuery('what is my home address'), null);
  assert.equal(destinationQuery('do not navigate to Central Library'), null);
  const choices = [1, 2].map(n => ({ id: String(n), title: 'Library ' + n, subtitle: 'Example city', latitude: n, longitude: n }));
  let calls = 0; let now = 100;
  const resolver = new AssistantDestination(() => ({ home: choices[0] }), async () => { calls++; return choices; }, () => now);
  let reply = await resolver.answer('set my destination to central library');
  assert.equal(reply.destination, undefined); assert.equal(reply.choices.length, 2);
  assert.equal((await resolver.answer('confirm')).destination, undefined);
  assert.equal((await resolver.answer('Hey Cubo option two')).confirmation.id, '2');
  assert.equal((await resolver.answer('yes')).destination.id, '2');
  assert.equal(resolver.acceptsFollowUp(), false);
  assert.equal((await resolver.answer('take me to home')).confirmation.id, '1');
  assert.equal((await resolver.answer('confirm')).destination.id, '1');
  assert.equal(calls, 1);
  await resolver.answer('navigate to central library'); now += 120001;
  assert.equal(await resolver.answer('option one'), null);
  await resolver.answer('navigate to central library');
  assert.equal((await resolver.answer('cancel')).choices.length, 0);
});
test('search errors, missing saved places and late cancelled requests do not navigate', async () => {
  const { AssistantDestination } = loader()('src/features/cuboAI/assistantDestination.ts');
  const resolver = new AssistantDestination(() => ({}), async () => { throw Error('offline'); });
  assert.match((await resolver.answer('take me to work')).text, /Set your work/);
  assert.match((await resolver.answer('navigate to central library')).text, /unavailable/);
  const cancelled = new AbortController(); cancelled.abort();
  assert.equal(await resolver.answer('navigate to central library', cancelled.signal), null);
});
test('destination presets bypass optional GPU model and preserve chat quota and history', async () => {
  const { CuboAISession } = loader()('src/features/cuboAI/session.ts');
  const values = new Map();
  const session = new CuboAISession({ uid: 'test', currentUid: () => 'test', isDriving: () => false,
    store: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) },
    localAction: async text => text.includes('navigate') ? 'Choose the correct address.' : null,
    loadModel: async () => ({ reply: () => assert.fail('Destination reached GPU'), dispose() {} }) });
  await session.prepare(true);
  assert.equal((await session.send('navigate to library')).content, 'Choose the correct address.');
  assert.equal(session.state().used, 1); assert.equal(session.state().messages.length, 2);
  await session.dispose();
});
test('suggestions do not restart for GPS movement; Home and composer expose requested controls', () => {
  const hook = fs.readFileSync('src/features/places/usePlaceSuggestions.ts', 'utf8');
  assert.match(hook, /\[clean, enabled\]/); assert.match(hook, /controller.signal.aborted/);
  const saved = fs.readFileSync('src/screens/SavedPlaceScreen.tsx', 'utf8');
  assert.match(saved, /usePlaceSuggestions/); assert.doesNotMatch(saved, /setPlaces\(\[\]\)/);
  const chat = fs.readFileSync('src/screens/CuboAIScreen.web.tsx', 'utf8');
  assert.match(chat, /aria-label=\{voiceOn \? 'Stop Cubo Voice Assist' : 'Start Cubo Voice Assist'\}/); assert.match(chat, /'Load General AI'/);
  assert.match(chat, /navigate\('DriveMap', \{ destination \}\)/); assert.doesNotMatch(chat, /startDrive\(/);
  assert.match(fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8'), /Ask Cubo Assistant/);
});
test('GPS jitter preserves pending suggestions and late results cannot overwrite a newer query', async () => {
  const states = [], refs = []; let si = 0, ri = 0, deps, cleanup, callback;
  const requests = [];
  const react = {
    useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], v => states[i] = v]; },
    useRef(initial) { const i = ri++; return refs[i] ??= { current: initial }; },
    useEffect(fn, next) { if (!deps || next.some((v, i) => v !== deps[i])) { cleanup?.(); deps = next; callback = fn; } },
  };
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync('src/features/places/usePlaceSuggestions.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('module', 'exports', 'require', js)(m, m.exports, n => n === 'react' ? react : { searchPlaces: (query, origin, signal) => new Promise(resolve => requests.push({ query, origin, signal, resolve })) });
  function render(query, origin) { si = 0; ri = 0; m.exports.usePlaceSuggestions(query, origin); if (callback) { const effect = callback; callback = null; cleanup = effect(); } }
  try {
    render('first query', { latitude: 1, longitude: 1 });
    await new Promise(r => setTimeout(r, 240));
    render('first query', { latitude: 1.00001, longitude: 1.00001 });
    assert.equal(requests.length, 1); assert.equal(requests[0].signal.aborted, false);
    render('second query', { latitude: 1, longitude: 1 });
    assert.equal(requests[0].signal.aborted, true);
    await new Promise(r => setTimeout(r, 240));
    requests[1].resolve([{ id: 'new' }]); await new Promise(r => setImmediate(r));
    requests[0].resolve([{ id: 'old' }]); await new Promise(r => setImmediate(r));
    assert.equal(states[0][0].id, 'new');
  } finally { cleanup?.(); }
});

