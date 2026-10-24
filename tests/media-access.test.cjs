const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const ts = require('typescript');
function load(file) { const m = { exports: {} }; new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports); return m.exports; }
const access = load('src/features/permissions/mediaAccess.web.ts');

test('location checks use geolocation permission and release the watch on every exit', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = Object.getOwnPropertyDescriptor(global, 'navigator'), secure = global.isSecureContext;
  let success, failure, options, query, starts = 0;
  const cleared = [];
  Object.defineProperty(global, 'navigator', { configurable: true, value: {
    permissions: { query: async value => { query = value; return { state: 'granted' }; } },
    geolocation: {
      watchPosition: (ok, fail, config) => { starts++; success = ok; failure = fail; options = config; return starts; },
      clearWatch: id => cleared.push(id),
    },
  } });
  global.isSecureContext = true;
  try {
    assert.equal(await access.checkMediaAccess('location'), 'Allowed');
    assert.deepEqual(query, { name: 'geolocation' }); assert.equal(starts, 0);
    const allowed = access.requestMediaAccess('location');
    success({ coords: { latitude: 1, longitude: 2 } });
    assert.match(await allowed, /Allowed just now/);
    assert.deepEqual(cleared, [1]);
    assert.deepEqual(options, { enableHighAccuracy: false, maximumAge: 0, timeout: 15000 });
    for (const [code, message] of [[1, /not allowed/], [2, /unavailable/], [3, /timed out/]]) {
      const request = access.requestMediaAccess('location');
      const rejection = assert.rejects(request, message);
      failure({ code }); await rejection;
      assert.equal(cleared.at(-1), starts);
    }
    const controller = new AbortController();
    const cancelled = access.requestMediaAccess('location', controller.signal);
    const rejected = assert.rejects(cancelled, /cancelled/);
    controller.abort(); await rejected;
    const count = cleared.length;
    success({ coords: { latitude: 5, longitude: 6 } });
    assert.equal(cleared.length, count);
    const timeout = access.requestMediaAccess('location');
    const timedOut = assert.rejects(timeout, /timed out/);
    t.mock.timers.tick(20000); await timedOut;
    assert.equal(cleared.at(-1), starts);
    const before = starts;
    await assert.rejects(access.requestMediaAccess('location', controller.signal), /cancelled/);
    assert.equal(starts, before);
    global.isSecureContext = false;
    await assert.rejects(access.requestMediaAccess('location'), /HTTPS/);
    assert.equal(starts, before);
  } finally { if (original) Object.defineProperty(global, 'navigator', original); else delete global.navigator; global.isSecureContext = secure; }
});

test('location appears alongside existing access controls and is checked without starting tracking', () => {
  const view = fs.readFileSync('src/components/MediaAccessPreference.tsx', 'utf8');
  assert.match(view, /Camera, microphone & location/);
  assert.match(view, /\['camera', 'microphone', 'location'\]/);
  assert.match(view, /checkMediaAccess\('location'\)/);
  assert.match(view, /pending.current\?\.abort\(\)/);
  const native = fs.readFileSync('src/features/permissions/mediaAccess.ts', 'utf8');
  assert.match(native, /requestForegroundPermissionsAsync/);
  assert.doesNotMatch(native, /requestBackgroundPermissionsAsync|watchPositionAsync/);
});
test('permission query never starts hardware; grant checks request only selected device and stop all tracks', async () => {
  const original = Object.getOwnPropertyDescriptor(global, 'navigator'); const secure = global.isSecureContext;
  let requested = [], stopped = 0;
  Object.defineProperty(global, 'navigator', { configurable: true, value: { permissions: { query: async () => ({ state: 'granted' }) }, mediaDevices: { getUserMedia: async constraints => { requested.push(constraints); return { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] }; } } } });
  global.isSecureContext = true;
  try {
    assert.equal(await access.checkMediaAccess('camera'), 'Allowed'); assert.equal(requested.length, 0);
    assert.match(await access.requestMediaAccess('camera'), /Allowed just now/); assert.deepEqual(requested[0], { audio: false, video: true }); assert.equal(stopped, 2);
    await access.requestMediaAccess('microphone'); assert.deepEqual(requested[1], { audio: true, video: false }); assert.equal(stopped, 4);
    navigator.permissions.query = async () => { throw Error('unsupported'); };
    assert.equal(await access.checkMediaAccess('microphone'), 'Verified this session · browser manages permission');
    navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(Error('blocked'), { name: 'NotAllowedError' }); };
    await assert.rejects(access.requestMediaAccess('microphone'), /blocked/);
  } finally { if (original) Object.defineProperty(global, 'navigator', original); else delete global.navigator; global.isSecureContext = secure; }
});
test('permissions setting remains in account without exposing the map source selector', () => {
  const profile = fs.readFileSync('src/screens/ProfileScreen.tsx', 'utf8');
  assert.match(profile, /<MediaAccessPreference \/>/);
  assert.doesNotMatch(profile, /MapSourcePreference/);
  if (profile.includes('<VoicePreference />')) assert.ok(profile.indexOf('<MediaAccessPreference />') < profile.indexOf('<VoicePreference />'));
  const view = fs.readFileSync('src/components/MediaAccessPreference.tsx', 'utf8');
  assert.match(view, /requestMediaAccess\(kind, request.signal\)/); assert.match(view, /activeSession/);
  assert.doesNotMatch(view, /localStorage|AsyncStorage|CameraView|<video|MediaRecorder/);
});

test('ignored prompts time out; late grants and cancelled checks release hardware', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = Object.getOwnPropertyDescriptor(global, 'navigator'), secure = global.isSecureContext;
  let grant, stopped = 0;
  Object.defineProperty(global, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise(resolve => grant = resolve) } } });
  global.isSecureContext = true;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  try {
    const pending = access.requestMediaAccess('camera');
    const timeout = assert.rejects(pending, /No permission response/);
    t.mock.timers.tick(20000); await timeout;
    grant(stream); await Promise.resolve(); assert.equal(stopped, 1);
    const controller = new AbortController();
    const cancelled = access.requestMediaAccess('microphone', controller.signal);
    const rejection = assert.rejects(cancelled, /cancelled/);
    controller.abort(); await rejection;
    grant(stream); await Promise.resolve(); assert.equal(stopped, 2);
  } finally { if (original) Object.defineProperty(global, 'navigator', original); else delete global.navigator; global.isSecureContext = secure; }
});
