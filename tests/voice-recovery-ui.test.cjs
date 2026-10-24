const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');

test('voice input offers a microphone grant before surfacing a terminal error', () => {
  const assistant = read('src/screens/CuboAIScreen.web.tsx');
  const map = read('src/screens/MapScreen.web.tsx');
  const drive = read('src/components/DriveVoiceControl.web.tsx');
  for (const source of [assistant, map, drive]) {
    assert.match(source, /requestMediaAccess\('microphone'\)/);
    assert.match(source, /Enable (?:your )?microphone/);
    assert.match(source, /isRecoverableMicrophoneFailure/);
  }
  assert.match(assistant, /micRecoveryShown/);
  assert.match(map, /mapMicRecoveryShown/);
  assert.match(drive, /micRecoveryShown/);
});

test('assistant and map share the human voice icon and opt-in map droid', () => {
  const assistant = read('src/screens/CuboAIScreen.web.tsx');
  const map = read('src/screens/MapScreen.web.tsx');
  const icon = read('src/components/VoiceAssistIcon.tsx');
  assert.match(icon, /M10\.7 4\.4/);
  assert.match(assistant, /Hide droid on Map/);
  assert.match(assistant, /Show droid on Map/);
  assert.match(assistant, /bottom:14px;left:14px/);
  assert.match(map, /mapDroidVisible/);
  assert.match(map, /<VoiceAssistIcon/);
  assert.doesNotMatch(map, /onPress=\{\(\) => navigation\.navigate\('CuboAI'\)\}/);
});
