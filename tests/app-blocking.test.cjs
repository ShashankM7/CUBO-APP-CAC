const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function loadPolicy() {
  const module = { exports: {} };
  const source = fs.readFileSync('src/features/appBlocking/policy.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const apps = ['instagram', 'tiktok', 'snapchat', 'youtube'].map(id => ({ id, name: id, icon: 1 }));
  new Function('module', 'exports', 'require', code)(module, module.exports, request => request.includes('blockApps') ? { BLOCK_APPS: apps } : require(request));
  return module.exports;
}

test('blocking policies remove unknown and duplicate app identifiers', () => {
  const { cleanSelectedIds, makeBlockingPolicy, blockingSummary } = loadPolicy();
  assert.deepEqual(cleanSelectedIds(['instagram', 'instagram', 'unknown', 1]), ['instagram']);
  const policy = makeBlockingPolicy('child-1', ' Child 1 ', { enabled: true, selectedIds: ['tiktok', 'unknown'] });
  assert.equal(policy.targetName, 'Child 1');
  assert.deepEqual(blockingSummary(policy).map(app => app.id), ['tiktok']);
  assert.deepEqual(blockingSummary({ ...policy, enabled: false }), []);
});

test('Account placement, family controls and drive lifecycle remain wired', () => {
  const profile = fs.readFileSync('src/screens/ProfileScreen.tsx', 'utf8');
  assert.ok(profile.indexOf('title="Cubo Devices"') < profile.indexOf('title="Blocked apps"'));
  assert.ok(profile.indexOf('title="Blocked apps"') < profile.indexOf('title="Privacy and safety"'));
  assert.match(fs.readFileSync('src/components/DemoFamilyProfile.tsx', 'utf8'), /DrivingAppLimitsCard/);
  assert.match(fs.readFileSync('src/screens/FamilyMemberScreen.tsx', 'utf8'), /accountType === 'minor'/);
  const map = fs.readFileSync('src/screens/MapScreen.tsx', 'utf8');
  assert.match(map, /setDriveBlockPlan\(beginAppBlocking\(\)\)/);
  assert.match(map, /endAppBlocking\(\)/);
  assert.match(map, /<DriveBlockModal/);
});

test('UI is honest about the native enforcement boundary', () => {
  const screen = fs.readFileSync('src/screens/AppBlockingScreen.tsx', 'utf8');
  const modal = fs.readFileSync('src/components/DriveBlockModal.tsx', 'utf8');
  assert.match(screen, /Actual iPhone and Android app blocking still requires/);
  assert.match(modal, /SAFETY MONITORING ACTIVE/);
  assert.match(modal, /Selected apps blocked during drive/);
  assert.match(modal, /setTimeout[\s\S]*2700/);
  assert.match(modal, /justifyContent: 'center'/);
  assert.match(modal, /translateY[\s\S]*-40/);
  assert.match(screen, /Child Lock/);
  assert.match(screen, /setTimeout[\s\S]*navigation\.goBack/);
  assert.doesNotMatch(screen, /Parent lock/i);
  const catalog = fs.readFileSync('src/data/blockApps.ts', 'utf8');
  assert.match(catalog, /name: 'Facebook'/);
  assert.match(catalog, /name: 'Telegram'/);
  assert.doesNotMatch(screen, /Apps are blocked/);
  for (const file of ['src/screens/AppBlockingScreen.tsx', 'src/screens/ProfileScreen.tsx', 'src/screens/NotificationsScreen.tsx', 'src/components/DrivingAppLimitsCard.tsx']) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /Drive Focus/i);
});
