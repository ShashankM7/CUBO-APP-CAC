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
  const { cleanSelectedIds, makeBlockingPolicy, policyForAccountType, blockingSummary } = loadPolicy();
  assert.deepEqual(cleanSelectedIds(['instagram', 'instagram', 'unknown', 1]), ['instagram']);
  const policy = makeBlockingPolicy('child-1', ' Child 1 ', { enabled: true, selectedIds: ['tiktok', 'unknown'] });
  assert.equal(policy.targetName, 'Child 1');
  assert.deepEqual(blockingSummary(policy).map(app => app.id), ['tiktok']);
  assert.deepEqual(blockingSummary({ ...policy, enabled: false }), []);
  assert.equal(policyForAccountType({ ...policy, lockedByParent: true }, 'adult').lockedByParent, false);
  assert.equal(policyForAccountType({ ...policy, lockedByParent: true }, 'minor').lockedByParent, true);
});

test('adult accounts cannot retain a stale family Child Lock', () => {
  const provider = fs.readFileSync('src/features/appBlocking/AppBlockingContext.tsx', 'utf8');
  const connections = fs.readFileSync('src/features/connections/ConnectionContext.tsx', 'utf8');
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.match(provider, /policyForAccountType\(assigned, 'adult'\)/);
  assert.match(provider, /deleteDoc\(doc\(db, 'familyAppPolicies', user\.uid\)\)/);
  assert.match(provider, /accountDetails\?\.accountType === 'adult' \? undefined : familyPolicies\[user\.uid\]/);
  assert.match(connections, /request\.requestedAccountType === 'adult'[\s\S]*familyAppPolicies[\s\S]*stalePolicy\?\.exists\(\)/);
  assert.match(rules, /isAdultAccount\(request\.auth\.uid\)/);
});

test('Account placement, family controls and drive lifecycle remain wired', () => {
  const profile = fs.readFileSync('src/screens/ProfileScreen.tsx', 'utf8');
  assert.ok(profile.indexOf('title="Cubo Devices"') < profile.indexOf('title="Blocked Apps"'));
  assert.ok(profile.indexOf('title="Blocked Apps"') < profile.indexOf('title="Privacy & Safety"'));
  assert.match(fs.readFileSync('src/screens/ConnectionProfileScreen.tsx', 'utf8'), /DrivingAppLimitsCard/);
  assert.match(fs.readFileSync('src/screens/ConnectionProfileScreen.tsx', 'utf8'), /memberAccountType === 'minor'/);
  const map = fs.readFileSync('src/screens/MapScreen.tsx', 'utf8');
  assert.match(map, /setDriveBlockPlan\(beginAppBlocking\(\)\)/);
  assert.match(map, /endAppBlocking\(\)/);
  assert.match(map, /<DriveBlockModal/);
  const webMap = fs.readFileSync('src/screens/MapScreen.web.tsx', 'utf8');
  assert.match(webMap, /setDriveBlockPlan\(beginAppBlocking\(\)\)/);
  assert.match(webMap, /endAppBlocking\(\)/);
  assert.match(webMap, /<DriveBlockModal/);
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
  assert.match(screen, /Turn off Blocked Apps/);
  assert.match(screen, /Turn on Blocked Apps/);
  assert.match(screen, /setTimeout[\s\S]*navigation\.goBack/);
  assert.doesNotMatch(screen, /Parent lock/i);
  const catalog = fs.readFileSync('src/data/blockApps.ts', 'utf8');
  assert.match(catalog, /name: 'Facebook'/);
  assert.match(catalog, /name: 'Telegram'/);
  assert.doesNotMatch(screen, /Apps are blocked/);
  assert.match(fs.readFileSync('src/components/DrivingAppLimitsCard.tsx', 'utf8'), /Manage \$\{targetName\}'s Blocked Apps/);
  assert.match(fs.readFileSync('src/components/DrivingAppLimitsCard.tsx', 'utf8'), /connectionId/);
  const provider = fs.readFileSync('src/features/appBlocking/AppBlockingContext.tsx', 'utf8');
  assert.match(provider, /familyAppPolicies/);
  assert.match(provider, /lockedByParent/);
  assert.match(provider, /Your family organizer selected/);
  assert.match(provider, /assignedPolicies = \{\}; merge\(\)/);
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.match(rules, /allow list: if isAuthenticated\(\)[\s\S]*resource\.data\.organizerUid == request\.auth\.uid/);
  assert.match(rules, /allow get: if isAuthenticated\(\)[\s\S]*isActiveMinorFamily/);
  assert.match(rules, /request\.resource\.data\.targetName == get\(\/databases\/\$\(database\)\/documents\/connections\/\$\(resource\.data\.connectionId\)\)\.data\.memberName/);
  assert.match(fs.readFileSync('src/features/connections/ConnectionContext.tsx', 'utf8'), /familyPolicyExists[\s\S]*batch\.delete\(familyPolicyRef\)/);
  assert.match(fs.readFileSync('src/screens/NotificationsScreen.tsx', 'utf8'), /navigation\.navigate\('AppBlocking', \{ targetUid: notice\.targetUid, targetName: notice\.targetName \}\)/);
  assert.doesNotMatch(fs.readFileSync('src/features/appBlocking/AppBlockingContext.tsx', 'utf8'), /Driving app limits updated/);
  for (const file of ['src/screens/AppBlockingScreen.tsx', 'src/screens/ProfileScreen.tsx', 'src/screens/NotificationsScreen.tsx', 'src/components/DrivingAppLimitsCard.tsx']) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /Drive Focus/i);
});
