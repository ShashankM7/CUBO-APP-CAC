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
  assert.match(map, /server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery/);
  assert.match(map, /Imagery © Esri, Vantor, Earthstar, GIS Community/);
  assert.doesNotMatch(map, /s2cloudless-2025_3857/);
  assert.match(map, /transportation/);
  assert.match(map, /mapStyle === 'satellite' \? streetStyle\('light'\) : streetStyle\(appearance\)/);
  assert.match(map, /'raster-opacity': 1/);
  assert.match(map, /'raster-saturation': 0/);
  assert.match(map, /'raster-contrast': 0/);
  assert.doesNotMatch(map, /'raster-opacity': appearance/);
});

test('account no longer exposes the platform map-source preference', () => {
  const profile = read('src/screens/ProfileScreen.tsx');
  assert.doesNotMatch(profile, /MapSourcePreference/);
});
