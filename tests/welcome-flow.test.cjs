const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('carousel bundles six distinct compact JPEG photographs', () => {
  const source = read('src/components/WelcomeCarousel.tsx');
  const assets = [...source.matchAll(/require\('\.\.\/\.\.\/(assets\/[^']+)'\)/g)].map(match => match[1]);
  assert.equal(assets.length, 6);
  const hashes = assets.map(asset => {
    const bytes = fs.readFileSync(path.join(root, asset));
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    assert.ok(bytes.length < 500000, `${asset} should remain mobile-sized`);
    return crypto.createHash('sha256').update(bytes).digest('hex');
  });
  assert.equal(new Set(hashes).size, 6);
  assert.match(source, /pagingEnabled/);
  assert.match(source, /accessibilityState=\{\{ selected: page === index \}\}/);
  assert.doesNotMatch(source, /setInterval/);
});

test('shared welcome flow replaces instant screen swap and supports reduced motion/back', () => {
  const flow = read('src/screens/WelcomeFlow.tsx');
  const app = read('App.tsx');
  assert.match(app, /if \(!user\) return <WelcomeFlow initialMode=/);
  assert.doesNotMatch(app, /hasStarted/);
  assert.match(flow, /duration: reduced \? 140 : login \? 440 : 340/);
  assert.match(flow, /hardwareBackPress/);
  assert.match(flow, /if \(locked.current/);
  assert.match(flow, /return \(\) => animation.stop\(\)/);
  assert.match(flow, /if \(!login\) setMounted\(false\)/);
  assert.match(flow, /const startInAuth = !!initialMode/);
});

test('brand-led welcome has real direct sign-in and signup controls', () => {
  const screen = read('src/screens/WelcomeScreen.tsx');
  const flow = read('src/screens/WelcomeFlow.tsx');
  assert.match(screen, /PERSONAL DRIVE ASSISTANT/);
  assert.match(screen, /style=\{s.wordmark\}>CUBO<\/Text>/);
  assert.match(screen, /onChooseMode\('login'\)/);
  assert.match(screen, /onChooseMode\('signup'\)/);
  assert.match(flow, /setAuthMode\(mode\); navigate\(true\)/);
  assert.match(flow, /AuthScreen initialMode=\{authMode\}/);
  assert.match(screen, /assets\/vehicles\/compact-car-green.png/);
  assert.ok(fs.statSync(path.join(root, 'assets/vehicles/compact-car-green.png')).size < 2000000);
  assert.match(screen, /Drive smarter/);
  assert.doesNotMatch(screen, /WelcomeCarousel|Get started|Stay with the road|cubo-dusk/);
});
