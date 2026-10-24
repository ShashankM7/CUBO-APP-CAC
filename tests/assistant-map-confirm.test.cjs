const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function load(file) { const m = { exports: {} }; new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports, n => load(path.resolve(path.dirname(file), n + '.ts'))); return m.exports; }
const { AssistantDestination } = load('src/features/cuboAI/assistantDestination.ts');
const place = { id: 'one', title: 'Library', subtitle: 'Example city', latitude: 1, longitude: 1 };
test('single match and saved Home both ask before switching to Map', async () => {
  const resolver = new AssistantDestination(() => ({ home: place }), async () => [place]);
  for (const prompt of ['set the destination to library', 'navigate home', 'Hey Cuba set my destination to Enloe high school']) {
    const answer = await resolver.answer(prompt);
    assert.equal(answer.destination, undefined); assert.equal(answer.confirmation.id, 'one');
    assert.match(answer.text, /Switch to Map/);
    assert.match(resolver.spokenChoices(), /Switch to Map/);
    assert.equal((await resolver.answer('yes')).destination.id, 'one');
    assert.equal(await resolver.answer('confirm'), null);
  }
});
test('cancel, timeout and a different question cannot switch to Map', async () => {
  let now = 100;
  const resolver = new AssistantDestination(() => ({}), async () => [place], () => now);
  await resolver.answer('navigate to library');
  assert.equal((await resolver.answer('no')).destination, undefined);
  assert.equal(await resolver.answer('yes'), null);
  await resolver.answer('navigate to library'); now += 120001;
  assert.equal(await resolver.answer('confirm'), null);
  await resolver.answer('navigate to library');
  assert.equal(await resolver.answer('what is my score'), null);
  assert.equal(await resolver.answer('yes'), null);
});
test('chat exposes explicit switch and stay controls, menu attribution and full shortcut hit target', () => {
  const screen = fs.readFileSync('src/screens/CuboAIScreen.web.tsx', 'utf8');
  assert.match(screen, /Switch to Map confirmation/); assert.match(screen, />Stay here</);
  assert.match(screen, />Llama license</); assert.doesNotMatch(screen, /className="ai-credit"/);
  const home = fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8');
  assert.match(home, /accessibilityLabel="Ask Cubo Assistant"/);
  assert.match(home, /pointerEvents="none"/); assert.doesNotMatch(home, /name="pulse-outline"/);
});
