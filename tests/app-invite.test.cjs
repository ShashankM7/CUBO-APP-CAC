const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, requireMock = require, navigatorMock) {
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('module', 'exports', 'require', 'navigator', js)(m, m.exports, requireMock, navigatorMock);
  return m.exports;
}
const { createInvitation, CUBO_INVITE_URL } = load('src/features/invite/invitation.ts');
test('invitation personalizes only the supplied name and uses production URL', () => {
  const text = createInvitation('  Shashank  ');
  assert.match(text, /^Shashank is inviting you to join CUBO!/);
  assert.equal(text.split(CUBO_INVITE_URL).length, 2);
  for (const step of ['Safari', 'Share', 'Add to Home Screen', 'Open as Web App', 'Chrome']) assert.ok(text.includes(step));
  assert.ok(!text.includes('localhost'));
});
test('missing names and long or multiline names remain safe plain text', () => {
  for (const name of [null, undefined, '   ']) assert.match(createInvitation(name), /^You're invited/);
  assert.match(createInvitation('Sam\nSmith'), /^Sam Smith is inviting/);
  assert.ok(createInvitation('X'.repeat(200)).startsWith('X'.repeat(80) + ' is inviting'));
});
test('web copy passes exact invitation and propagates permission errors', async () => {
  let copied;
  const actions = load('src/features/invite/invitationActions.web.ts', require, { clipboard: { writeText: async text => { copied = text; } } });
  await actions.copyInvitation('Invitation');
  assert.equal(copied, 'Invitation');
  const blocked = load('src/features/invite/invitationActions.web.ts', require, {});
  await assert.rejects(blocked.copyInvitation('Invitation'));
});
test('web share handles unsupported, success, cancellation and real failures', async () => {
  const file = 'src/features/invite/invitationActions.web.ts';
  assert.equal(await load(file, require, {}).shareInvitation('Hi'), 'unavailable');
  let payload;
  assert.equal(await load(file, require, { share: async data => { payload = data; } }).shareInvitation('Hi'), 'opened');
  assert.deepEqual(payload, { title: 'Join me on CUBO', text: 'Hi' });
  const cancelled = Object.assign(new Error(), { name: 'AbortError' });
  assert.equal(await load(file, require, { share: async () => { throw cancelled; } }).shareInvitation('Hi'), 'cancelled');
  await assert.rejects(load(file, require, { share: async () => { throw new Error('Denied'); } }).shareInvitation('Hi'));
});
test('native copy checks success and native share respects dismissal', async () => {
  let copied;
  const actions = load('src/features/invite/invitationActions.ts', id => id === 'expo-clipboard'
    ? { setStringAsync: async text => { copied = text; return true; } }
    : { Share: { dismissedAction: 'dismissedAction', share: async () => ({ action: 'dismissedAction' }) } });
  await actions.copyInvitation('Hi');
  assert.equal(copied, 'Hi');
  assert.equal(await actions.shareInvitation('Hi'), 'cancelled');
});
test('Account exposes invite immediately before Help; sheet is conditional', () => {
  const profile = fs.readFileSync('src/screens/ProfileScreen.tsx', 'utf8');
  assert.ok(profile.indexOf('title="Invite someone"') < profile.indexOf('title="Help and feedback"'));
  assert.match(profile, /inviteOpen \? <AppInviteSheet name=\{profile.name\}/);
});
