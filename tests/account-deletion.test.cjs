const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function read(file) { return fs.readFileSync(file, 'utf8'); }

function loadDeletionHelpers() {
  const module = { exports: {} };
  const code = ts.transpileModule(read('src/features/auth/accountDeletion.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const stubs = {
    '@react-native-async-storage/async-storage': { default: {} },
    'firebase/auth': {},
    'firebase/firestore': {},
    '../../lib/firebase': { db: {} },
    './accountDetails': {
      parseBirthDate(value) {
        const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
        if (!match) throw Error('invalid');
        const [, month, day, year] = match;
        const date = new Date(`${year}-${month}-${day}T12:00:00Z`);
        if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) throw Error('invalid');
        return { birthDate: `${year}-${month}-${day}` };
      },
    },
  };
  new Function('module', 'exports', 'require', code)(module, module.exports, name => {
    if (name in stubs) return stubs[name];
    throw Error(`Unexpected import: ${name}`);
  });
  return module.exports;
}

test('birthday confirmation matches only the saved full date', () => {
  const { birthDateMatches } = loadDeletionHelpers();
  assert.equal(birthDateMatches('01/02/2008', '2008-01-02'), true);
  assert.equal(birthDateMatches('01/03/2008', '2008-01-02'), false);
  assert.equal(birthDateMatches('13/02/2008', '2008-01-02'), false);
  assert.equal(birthDateMatches('1/2/2008', '2008-01-02'), false);
});
test('deletion requires a fresh provider-agnostic Firebase sign-in', () => {
  const { recentSignIn } = loadDeletionHelpers();
  const now = Date.parse('2026-10-24T18:00:00Z');
  assert.equal(recentSignIn('2026-10-24T17:57:00Z', now), true);
  assert.equal(recentSignIn('2026-10-24T17:55:00Z', now), false);
  assert.equal(recentSignIn('not-a-date', now), false);
});

test('Account exposes a two-step birthday-confirmed destructive flow', () => {
  const profile = read('src/screens/ProfileScreen.tsx');
  const sheet = read('src/components/DeleteAccountSheet.tsx');
  assert.ok(profile.indexOf('>Log Out<') < profile.indexOf('>Delete Account<'));
  assert.match(profile, /dangerGroup/);
  assert.match(sheet, /Delete your account\?/);
  assert.match(sheet, /Confirm your birth date/);
  assert.match(sheet, /formatBirthInput\(value, birthDate\)/);
  assert.match(sheet, /placeholder="MM\/DD\/YYYY"/);
  assert.match(sheet, /Permanently delete account/);
  assert.doesNotMatch(sheet, /password/i);
});

test('account cleanup terminates shared identity and removes owned private data', () => {
  const deletion = read('src/features/auth/accountDeletion.ts');
  const auth = read('src/features/auth/AuthContext.tsx');
  for (const collection of ['connectionCodes', 'connectionRequests', 'connections', 'familyMemberships', 'birthDateChangeRequests', 'locationShareRequests', 'familyAppPolicies', 'roadReports']) {
    assert.match(deletion, new RegExp(`collection\\(db, '${collection}'\\)`));
  }
  for (const domain of ['vehicles', 'places', 'insurance', 'blockedApps', 'drives', 'assistant']) assert.match(deletion, new RegExp(`'${domain}'`));
  assert.match(deletion, /collectionGroup\(db, 'confirmations'\)/);
  assert.match(deletion, /Account Terminated/);
  assert.match(deletion, /deleteUser\(user\)/);
  assert.match(deletion, /deleteDoc\(userReference\)/);
  assert.match(deletion, /AsyncStorage\.multiRemove/);
  assert.match(auth, /setSignedOutDestination\('welcome'\)/);
});

test('Firestore deletion permissions remain owner-scoped and short-lived', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /function accountDeletionRequested\(userId\)/);
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /deletionRequestedAt == request\.time/);
  assert.match(rules, /deletionRequestedAt > request\.time - duration\.value\(15, 'm'\)/);
  assert.match(rules, /allow delete: if isOwner\(userId\) && accountDeletionRequested\(userId\)/);
  assert.match(rules, /ownerName == 'Account Terminated'/);
  assert.match(rules, /memberName == 'Account Terminated'/);
  assert.match(rules, /ownerShareScore == false && request\.resource\.data\.ownerShareLocation == false/);
  assert.match(rules, /memberShareScore == false && request\.resource\.data\.memberShareLocation == false/);
  assert.match(rules, /match \/\{document=\*\*\} \{ allow read, write: if false; \}/);
});
