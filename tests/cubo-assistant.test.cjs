const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const m = { exports: {} };
  new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports, n => load(path.resolve(path.dirname(file), n + '.ts')));
  return m.exports;
}
const { CuboAISession } = load('src/features/cuboAI/session.ts');
const { AssistantVoice } = load('src/features/cuboAI/assistantVoice.ts');
const { appAnswer } = load('src/features/cuboAI/appAnswers.ts');
const { readState, writeState } = load('src/features/cuboAI/localState.ts');
const store = () => { const m = new Map(); return { getItem: key => m.get(key) ?? null, setItem: (key, value) => m.set(key, value), removeItem: key => m.delete(key) }; };
test('typed and spoken questions share fresh saved account answers without fictional family facts', async () => {
  let vehicle = 'Toyota Prius';
  const session = new CuboAISession({ uid: 'a', currentUid: () => 'a', isDriving: () => false, store: store(), appContext: () => JSON.stringify({ selectedVehicle: vehicle, vehicleCount: 1 }), loadModel: () => assert.fail('No model download') });
  assert.match((await session.send('Hey Cubo could you tell me what automobile is selected please')).content, /Toyota Prius/);
  vehicle = 'Honda Civic';
  const voice = new AssistantVoice(async text => (await session.send(text, 'voice', true)).content);
  assert.match((await voice.answer('which vehicle am I using')).text, /Honda Civic/);
  assert.match((await session.send('my first child score')).content, /real linked accounts/);
  assert.match((await voice.answer('and their score')).text, /select that person/);
  assert.equal(session.state().used, 4);
  assert.equal(session.state().messages.at(-1).source, 'voice');
  await session.dispose();
});
test('spoken general conversation never invokes even an already loaded model', async () => {
  const session = new CuboAISession({ uid: 'a', currentUid: () => 'a', isDriving: () => false, store: store(), loadModel: async () => ({ reply: () => assert.fail('Voice reached inference'), dispose() {} }) });
  await session.prepare(true);
  const answer = await session.send('explain a distant galaxy', 'voice', true);
  assert.match(answer.content, /Ask about your saved/);
  await session.dispose();
});
test('chat never executes drive actions or fabricates live route facts', () => {
  for (const question of ['reroute my drive', 'what is my eta', 'what is my destination', 'and after that']) assert.match(appAnswer(question, '{}'), /no live route/);
  assert.match(appAnswer('report a hazard', '{}'), /not submitted/);
  assert.match(appAnswer('what is my current drive score', '{}'), /does not receive live/);
});
test('voice off requires confirmation and can be cancelled without submitting a chat message', async () => {
  let now = 1000, sends = 0;
  const voice = new AssistantVoice(async () => { sends++; return 'Saved answer'; }, () => now);
  assert.match((await voice.answer('please turn off voice assistance')).text, /Say yes/);
  voice.readyForReply(); now += 25000;
  assert.equal(voice.acceptsFollowUp('confirm'), true);
  assert.match((await voice.answer('what am I confirming')).text, /Turn off/);
  assert.equal((await voice.answer('confirm')).stop, true);
  assert.equal(sends, 0);
  await voice.answer('mute'); await voice.answer('cancel'); assert.equal((await voice.answer('confirm')).stop, undefined);
});
test('weekly quota, drive exclusion and account isolation also apply to voice', async () => {
  const storage = store(); let uid = 'a', driving = false;
  const session = new CuboAISession({ uid: 'a', currentUid: () => uid, isDriving: () => driving, store: storage, loadModel: () => assert.fail() });
  writeState(storage, { ...readState(storage, 'a'), used: 99 });
  await session.send('who are my children', 'voice', true);
  await assert.rejects(session.send('my name', 'voice', true), /allowance/);
  uid = 'b'; await assert.rejects(session.send('my name', 'voice', true), /account changed/);
  assert.equal(readState(storage, 'b').messages.length, 0);
  uid = 'a'; driving = true; await assert.rejects(session.send('my name', 'voice', true), /drive has ended/);
});
test('composer separates dictation from voice and retains attribution in a closable local panel', () => {
  const screen = fs.readFileSync('src/screens/CuboAIScreen.web.tsx', 'utf8');
  const dictation = screen.slice(screen.indexOf('function startListening()'), screen.indexOf('function toggleAssistant()'));
  assert.match(dictation, /setDraft\(previous/); assert.doesNotMatch(dictation, /session.current.send|\.send\(/);
  assert.match(screen, /Dictate message/); assert.match(screen, /Start voice conversation/); assert.match(screen, /const voiceIcon/);
  assert.match(screen, /send\(text, 'voice', true\)/);
  assert.match(screen, /Back to Cubo Assistant/); assert.match(screen, /setLicense\(false\)/);
  assert.match(screen, /fetch\('\/licenses\/llama-3.2.txt'/);
  assert.doesNotMatch(screen, /href="\/licenses|target="_blank"/);
  assert.match(screen, /Built with Llama/);
  assert.match(fs.readFileSync('public/licenses/llama-3.2.txt', 'utf8'), /LLAMA 3.2 COMMUNITY LICENSE AGREEMENT/);
  assert.match(screen, /<h1>Cubo Assistant<\/h1>/);
  assert.doesNotMatch(screen, /Message CuboAI|>CuboAI<|You are CuboAI/);
  assert.match(fs.readFileSync('src/features/cuboAI/localState.ts', 'utf8'), /cubo-ai:v1:/); // No data migration/reset for a branding change.
});
