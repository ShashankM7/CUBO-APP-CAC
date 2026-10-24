const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = file => fs.readFileSync(file, 'utf8');

test('Home uses the approved full-width cockpit with live account score and actionable readiness', () => {
  const home = read('src/screens/HomeScreen.tsx');
  const cockpit = read('src/components/HomeCockpit.tsx');
  assert.match(home, /<ScreenShell edgeToEdge safeAreaColor/);
  assert.match(home, /score=\{safetyScore\} measured=\{measuredDrives.length\}/);
  assert.match(cockpit, /Math\.max\(0, Math\.min\(100, p.score\)\)/);
  assert.match(cockpit, /p\.measured \? 'Average safety score' : 'Starter safety score'/);
  assert.match(home, /Where are you going\?/);
  assert.match(home, /Location', status: 'On demand'/);
  assert.match(home, /requestMediaAccess\('location', request\.signal\)/);
  assert.doesNotMatch(home, /title: 'Location'[\s\S]{0,180}navigate\('Account'\)/);
  assert.match(home, /blockingPolicy.enabled \? 'Configured' : 'Optional'/);
  assert.ok(home.indexOf('style={s.saved}') < home.indexOf('Ask Cubo Assistant'));
  assert.match(home, />Your Garage<\/Text>/);
  assert.match(home, /onInsurance=\{\(\) => navigation\.navigate\('InsuranceConnection'\)\}/);
  assert.doesNotMatch(home, />Drive services<\/Text>/i);
  assert.match(cockpit, /horizontal pagingEnabled/);
  assert.match(cockpit, /ref=\{carouselRef\}/);
  assert.match(cockpit, /scrollEventThrottle=\{16\}/);
  assert.match(cockpit, /accessibilityLabel="Show safety score" accessibilityState=\{\{ selected: page === 0 \}\}/);
  assert.match(cockpit, /accessibilityLabel="Show potential savings" accessibilityState=\{\{ selected: page === 1 \}\}/);
  assert.match(cockpit, /carouselRef\.current\?\.scrollTo/);
  assert.doesNotMatch(cockpit, /pointerEvents="none" style=\{s\.pageDots\}/);
  assert.match(cockpit, /Potential premium savings/);
  assert.match(cockpit, /purpleOpacity/);
  assert.match(cockpit, /#A98DBB/);
  assert.match(home, /const vehiclePages = \[\.\.\.vehicles, null\]/);
  assert.match(home, /Animated\.ScrollView[\s\S]*setPrimary\(vehicle\.id\)/);
  assert.match(home, /accessibilityLabel="Add another vehicle"/);
  assert.match(home, /style=\{s\.vehicleDots\}/);
  assert.match(home, /connections\.connections\.map/);
  assert.match(home, /contentContainerStyle=\{s\.peopleScroller\}/);
  assert.doesNotMatch(home, /apps blocked|Location On/);
});

test('Cubo Assistant uses a friendly animated character and distinct chat bubbles', () => {
  const assistant = read('src/screens/CuboAIScreen.web.tsx');
  assert.match(assistant, /assets\/assistant\/cubo-droid\.png/);
  assert.match(assistant, /className="ai-companion"/);
  assert.match(assistant, /id="ai-companion-title">What can we figure out together\?/);
  assert.match(assistant, /className="ai-droid-shell ai-droid-shell-compact"/);
  assert.doesNotMatch(assistant, /!data\?\.messages\.length && <div className="ai-welcome"><div className="ai-droid-shell"/);
  assert.match(assistant, /--ai-user-bubble/);
  assert.match(assistant, /--ai-assistant-bubble/);
  assert.match(assistant, /@keyframes ai-float/);
  assert.match(assistant, /@keyframes ai-message-in/);
  assert.match(assistant, /prefers-reduced-motion:reduce/);
});

test('idle map has one destination sheet, saved places and no unhelpful back-home card', () => {
  const map = read('src/screens/MapScreen.web.tsx');
  assert.equal((map.match(/<View style=\{styles.topCard\}>/g) || []).length, 1);
  assert.ok(map.indexOf('<View style={styles.topCard}>') > map.indexOf('<View style={[styles.bottomCard,'));
  assert.match(map, /kind: 'home'.*place: home/);
  assert.match(map, /kind: 'work'.*place: work/);
  assert.match(map, /activeSession \|\| navigationRoute/);
  assert.match(map, /accessibilityState=\{\{ disabled: true \}\}/);
  assert.doesNotMatch(map, />Back to home</);
  assert.match(map, /<DriveVoiceControl/);
  assert.match(map, /<DriveAttentionCamera/);
  assert.match(map, /const compactMap = height < 680/);
  assert.match(map, /maxHeight: idleSheetMaxHeight/);
  assert.match(map, /const idleSheetCollapsedHeight = 96/);
  assert.match(map, /setIdleSheetExpanded\(true\)/);
  assert.match(map, /accessibilityLabel=\{idleSheetExpanded \? 'Swipe down or tap to collapse destination panel' : 'Swipe up or tap to expand destination panel'\}/);
  assert.match(map, /\.\.\.idleSheetPan\.panHandlers/);
  assert.match(map, /onMoveShouldSetPanResponderCapture/);
  assert.match(map, /bottomCard: \{[^}]*overflow: 'hidden'/);
  assert.match(map, /activeSession && styles\.bottomCardDrive/);
  assert.match(map, /style=\{styles\.monitoringRow\}/);
  assert.match(map, /style=\{styles\.statBlock\}/);
  assert.match(map, /duration: reducedMotion \? 0 : 300/);
  assert.match(map, /activeSession \? children : <ScrollView/);
  assert.match(map, /!activeSession && !compactMap && <MotionPressable/);
});

test('five primary tabs preserve access to the vehicle garage', () => {
  const app = read('App.tsx');
  for (const name of ['Home', 'Map', 'Activity', 'Garage', 'Account']) assert.match(app, new RegExp(`<Tab.Screen name="${name}"`));
  const reveal = read('src/components/Reveal.tsx');
  assert.match(reveal, /duration: reduced \? 0 : 420/);
  assert.match(reveal, /return \(\) => animation.stop\(\)/);
});

test('welcome photo fills its viewport instead of retaining intrinsic asset dimensions', () => {
  const welcome = read('src/screens/WelcomeScreen.tsx');
  assert.match(welcome, /resizeMode="cover" style=\{\[StyleSheet.absoluteFill, \{ width: '100%', height: '100%' \}\]\}/);
});

test('web map uses a bounded normalized drawing buffer at fractional browser zoom', () => {
  const map = read('src/components/DrivingMap.web.tsx');
  assert.match(map, /Math.max\(1, Math.min\(2, Math.round\(window.devicePixelRatio \|\| 1\)\)\)/);
  assert.match(map, /new LibreMap\(\{ container: host.current, pixelRatio,/);
});
