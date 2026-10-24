const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function loadIdentity() {
  const module = { exports: {} };
  const source = fs.readFileSync('src/features/connections/connectionIdentity.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('module', 'exports', 'require', code)(module, module.exports, require);
  return module.exports;
}

test('Home and Account expose the separated Family and Friends flow', () => {
  const home = fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8');
  const profile = fs.readFileSync('src/screens/ProfileScreen.tsx', 'utf8');
  const screen = fs.readFileSync('src/screens/ConnectionsScreen.tsx', 'utf8');
  assert.match(home, />Family \/ Friends</);
  assert.match(home, />Enter Code</);
  assert.match(home, />Create Code</);
  assert.match(profile, /title="Family"/);
  assert.doesNotMatch(profile, /Family safety/);
  assert.match(profile, /title="Drive Activity"/);
  assert.match(profile, /title="Camera Calibration"/);
  assert.match(screen, /Friend connections only share/);
  assert.match(screen, /Minor accounts are not eligible to generate Family codes/);
  assert.match(screen, /enterCode\(code, kind\)/);
  assert.match(screen, /This is a.*code|Codes only work in their matching section/);
});

test('minor family accounts require organizer review and friend removal asks first', () => {
  const provider = fs.readFileSync('src/features/connections/ConnectionContext.tsx', 'utf8');
  const account = fs.readFileSync('src/components/AccountEditor.tsx', 'utf8');
  const profile = fs.readFileSync('src/screens/ConnectionProfileScreen.tsx', 'utf8');
  const screen = fs.readFileSync('src/screens/ConnectionsScreen.tsx', 'utf8');
  const notifications = fs.readFileSync('src/screens/NotificationsScreen.tsx', 'utf8');
  assert.match(provider, /birthDateChangeRequests/);
  assert.match(provider, /requestBirthDateChange/);
  assert.match(provider, /reviewBirthDateChange/);
  assert.match(account, /Approval required/);
  assert.match(account, /saved age and account permissions stay unchanged until approval/);
  assert.match(account, /Update Pending Request/);
  assert.match(account, /Send Change Request/);
  assert.ok(account.indexOf('{requestingBirthChange ? saveDetailsButton : null}') < account.indexOf('Phone number (optional)'), 'minor DOB request action should appear before the phone field');
  assert.match(profile, /Birth-Date Change/);
  assert.match(profile, /Always shared with your family organizer/);
  assert.match(profile, /Request Location/);
  assert.match(profile, /Share Location/);
  assert.match(notifications, /requested an age change/);
  assert.match(notifications, /asked for your location/);
  assert.match(provider, /locationShareRequests/);
  assert.match(provider, /requestLocationShare/);
  assert.match(provider, /respondLocationShare/);
  assert.match(screen, /<ConfirmSheet visible=\{confirmRemove\}/);
  assert.match(screen, /item\.ownerAccountType === 'minor'/);
});

test('age role transitions remove stale parent authority and refresh relationship metadata', () => {
  const provider = fs.readFileSync('src/features/connections/ConnectionContext.tsx', 'utf8');
  const editor = fs.readFileSync('src/components/AccountEditor.tsx', 'utf8');
  const family = fs.readFileSync('src/screens/FamilyScreen.tsx', 'utf8');
  const profile = fs.readFileSync('src/screens/ConnectionProfileScreen.tsx', 'utf8');
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.match(provider, /ownerAccountType/);
  assert.match(provider, /reconcileOwnAccountRole/);
  assert.match(provider, /removedFamilyConnections/);
  assert.match(provider, /Minor accounts cannot approve Family requests/);
  assert.match(provider, /requesterAccountType: nextType/);
  assert.match(provider, /if \(request\.kind === 'family'\) batch\.set\(doc\(db, 'familyMemberships'/);
  assert.match(provider, /if \(item\.kind !== 'family'\) continue/);
  assert.match(provider, /cleanupState\[index\]\.membership/);
  assert.match(editor, /Switch to a minor account\?/);
  assert.match(editor, /close every Family connection you organize/);
  assert.match(editor, /linkedFamilyMember && changesBirth/);
  assert.match(family, /Parent controls removed/);
  assert.match(profile, /selfCanManageFamily/);
  assert.match(rules, /function isAdultAccount/);
  assert.match(rules, /resource\.data\.kind != 'family' \|\| isAdultAccount\(request\.auth\.uid\)/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['ownerAccountType', 'updatedAt'\]\)/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['requesterAccountType', 'updatedAt'\]\)/);
  assert.match(rules, /every linked family member/);
  assert.match(rules, /request\.resource\.data\.kind != 'family'\s*\|\| \(getAfter[\s\S]*familyMemberships/);
  assert.doesNotMatch(rules, /memberAccountType == 'adult'\);\s*}\s*match \/birthDateChangeRequests/);
});

test('shared locations are interactive and recenter on the latest snapshot', () => {
  const web = fs.readFileSync('src/components/SharedLocationMap.web.tsx', 'utf8');
  const native = fs.readFileSync('src/components/SharedLocationMap.native.tsx', 'utf8');
  const map = fs.readFileSync('src/components/DrivingMap.web.tsx', 'utf8');
  for (const source of [web, native]) {
    assert.match(source, /Drag or pinch to explore/);
    assert.match(source, /Zoom in/);
    assert.match(source, /Zoom out/);
    assert.match(source, /Recenter on/);
    assert.match(source, /\[(?:focused, )?latitude, longitude\]/);
  }
  assert.match(web, /interactive onPanDrag/);
  assert.match(native, /scrollEnabled zoomEnabled/);
  assert.match(map, /zoomBy/);
});

test('cartoon avatars replace initials and identity changes sync only to connected records', () => {
  const profile = fs.readFileSync('src/features/profile/ProfileContext.tsx', 'utf8');
  const picker = fs.readFileSync('src/components/AvatarPickerSheet.tsx', 'utf8');
  const home = fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8');
  const family = fs.readFileSync('src/screens/FamilyScreen.tsx', 'utf8');
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.equal(fs.readdirSync('assets/avatars').filter(name => name.endsWith('.png')).length, 12);
  assert.match(picker, /AVATAR_IDS\.map/);
  assert.match(profile, /ownerName: name, ownerAvatarId: avatarId/);
  assert.match(profile, /memberName: name, memberAvatarId: avatarId/);
  assert.match(home, /<HomeCockpit name=\{profile\.name\} avatarId=\{profile\.avatarId\}/);
  assert.match(fs.readFileSync('src/components/HomeCockpit.tsx', 'utf8'), /<ProfileAvatar avatarId=\{p\.avatarId\} photoUri=\{p\.photoUri\} uid=\{p\.uid\}/);
  assert.match(family, /<ProfileAvatar avatarId=\{avatarId\}/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['ownerName', 'ownerAvatarId', 'updatedAt'\]\)/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['memberName', 'memberAvatarId', 'updatedAt'\]\)/);
});

test('email accounts can link Google without replacing their CUBO identity', () => {
  const auth = fs.readFileSync('src/features/auth/AuthContext.tsx', 'utf8');
  const editor = fs.readFileSync('src/components/AccountEditor.tsx', 'utf8');
  const linker = fs.readFileSync('src/features/auth/linkGoogleAccount.web.ts', 'utf8');
  assert.match(auth, /googleLinked/);
  assert.match(auth, /linkGoogleAccount/);
  assert.match(editor, /Link your Google account/);
  assert.match(linker, /linkWithPopup\(current, googleProvider\)/);
});

test('join codes require approval and friend sharing stays opt-in', () => {
  const provider = fs.readFileSync('src/features/connections/ConnectionContext.tsx', 'utf8');
  assert.match(provider, /status: 'pending'/);
  assert.match(provider, /status: 'approved'/);
  assert.match(provider, /ownerShareScore: false/);
  assert.match(provider, /memberShareScore: request\.kind === 'family'/);
  assert.match(provider, /memberShareLocation: false/);
  assert.match(provider, /15 \* 60 \* 1000/);
  assert.match(provider, /requestForegroundPermissionsAsync/);
  assert.doesNotMatch(provider, /watchPositionAsync/);
  assert.match(provider, /This person is already in your/);
  assert.match(provider, /dedupeConnections/);
  assert.match(provider, /averageScore[\s\S]*: 100/);
  assert.match(provider, /ScoreMeasured/);
  assert.match(provider, /sessions\.some\(item => item\.attentionMeasured\)/);
  assert.match(provider, /requestSnapshotsReady/);
  assert.match(provider, /\[\.\.\.rawIncoming, \.\.\.rawOutgoing\]\.find/);
  assert.doesNotMatch(provider, /getDoc\(doc\(db, 'connectionRequests', requestId\)\)/);
});

test('family and friend pairs use separate stable IDs and duplicates collapse', () => {
  const { connectionPairId, dedupeConnections } = loadIdentity();
  assert.equal(connectionPairId('friend', 'user-b', 'user-a'), 'friend_user-a_user-b');
  assert.equal(connectionPairId('friend', 'user-a', 'user-b'), 'friend_user-a_user-b');
  assert.equal(connectionPairId('family', 'user-a', 'user-b'), 'family_user-a_user-b');
  const stamp = value => ({ toMillis: () => value });
  const old = { id: 'random-one', kind: 'friend', ownerUid: 'user-a', memberUid: 'user-b', updatedAt: stamp(1) };
  const latest = { ...old, id: 'random-two', updatedAt: stamp(2) };
  assert.deepEqual(dedupeConnections([old, latest]).map(item => item.id), ['random-two']);
});

test('Firestore rules scope code listing to its owner and bind approval to one connection without comparing UID strings', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.match(rules, /match \/connectionCodes\/\{codeId\}/);
  assert.match(rules, /allow list: if isAuthenticated\(\) && resource\.data\.ownerUid == request\.auth\.uid/);
  assert.match(rules, /accountDetails\.accountType == 'adult'/);
  assert.match(rules, /isConnectionPairId\(documentId, kind, firstUid, secondUid\)/);
  assert.match(rules, /connectionId == request\.resource\.data\.requestId/);
  assert.match(rules, /isConnectionPairId\(requestId/);
  assert.match(rules, /reverseConnectionId/);
  assert.doesNotMatch(rules, /firstUid < secondUid/);
  assert.match(rules, /data.kind == 'family'.*data.code.matches\('\^F-/s);
  assert.match(rules, /data.kind == 'friend'.*data.code.matches\('\^R-/s);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['ownerShareScore'/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['memberShareScore'/);
  assert.match(rules, /ownerScoreMeasured/);
  assert.match(rules, /memberScoreMeasured/);
  assert.match(rules, /match \/locationShareRequests\/\{connectionId\}/);
  assert.match(rules, /Participant-scoped listeners must be able to receive and dismiss an/);
  assert.match(rules, /allow list: if isAuthenticated\(\)[\s\S]*resource\.data\.organizerUid == request\.auth\.uid \|\| resource\.data\.minorUid == request\.auth\.uid\);/);
  assert.match(rules, /allow get: if isAuthenticated\(\)[\s\S]*isActiveMinorFamily\(connectionId/);
  assert.match(rules, /match \/familyAppPolicies\/\{minorId\}/);
  assert.match(rules, /memberShareScore == true/);
  assert.match(rules, /resource\.data\.status == 'pending' && request\.resource\.data\.status in \['approved', 'denied'\]/);
});
