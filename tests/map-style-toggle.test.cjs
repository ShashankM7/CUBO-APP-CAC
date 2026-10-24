const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('web driving map offers an accessible street and satellite toggle', () => {
  const screen = read('src/screens/MapScreen.web.tsx');
  const map = read('src/components/DrivingMap.web.tsx');

  assert.match(screen, /accessibilityRole="switch"/);
  assert.match(screen, /accessibilityLabel="Satellite view"/);
  assert.match(screen, /mapStyle=\{mapStyle\}/);
  assert.match(map, /s2cloudless-2025_3857/);
  assert.match(map, /Satellite © EOX \/ Copernicus 2025/);
  assert.match(map, /transportation/);
});
