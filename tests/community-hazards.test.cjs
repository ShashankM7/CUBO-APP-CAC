const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');

test('community hazards are authenticated, anonymous to the UI, bounded and atomically confirmed', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /function validRoadReport\(data\)/);
  assert.match(rules, /match \/roadReports\/\{reportId\}/);
  assert.match(rules, /allow read: if isAuthenticated\(\)/);
  assert.match(rules, /request\.resource\.data\.reporterId == request\.auth\.uid/);
  assert.match(rules, /createdAt \+ duration\.value\(30, 'm'\) > request\.time/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['confirmationCount', 'active'\]\)/);
  assert.match(rules, /getAfter\(\/databases\/\$\(database\)\/documents\/roadReports\/\$\(reportId\)\/confirmations\/\$\(request\.auth\.uid\)\)/);
  assert.match(rules, /allow delete: if isAuthenticated\(\) && resource\.data\.reporterId == request\.auth\.uid\s*&& accountDeletionRequested\(request\.auth\.uid\)/);
});

test('community hazard query has its required nearby-cell index', () => {
  const config = JSON.parse(read('firebase.json'));
  const indexes = JSON.parse(read('firestore.indexes.json'));
  assert.equal(config.firestore.indexes, 'firestore.indexes.json');
  assert.deepEqual(indexes.indexes[0].fields, [
    { fieldPath: 'cell', order: 'ASCENDING' },
    { fieldPath: 'createdAt', order: 'DESCENDING' },
  ]);
  assert.deepEqual(indexes.fieldOverrides, [{
    collectionGroup: 'confirmations',
    fieldPath: 'voterId',
    indexes: [{ order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' }],
  }]);
  const client = read('src/features/drives/useRoadReports.ts');
  assert.match(client, /where\('cell', 'in', cells\)/);
  assert.match(client, /where\('createdAt', '>', Timestamp\.fromMillis\(cutoff\)\)/);
  assert.match(client, /limit\(100\)/);
  assert.match(client, /const coordinates = \{ latitude: location\.latitude, longitude: location\.longitude \}/);
  assert.match(client, /setDoc\(ref, \{ reporterId: user\.uid, kind, \.\.\.coordinates,/);
  assert.doesNotMatch(client, /setDoc\(ref, \{ reporterId: user\.uid, kind, \.\.\.location,/);
});

test('drive maps filter alerts to the active route and auto-finish one second after arrival', () => {
  for (const file of ['src/screens/MapScreen.web.tsx', 'src/screens/MapScreen.tsx']) {
    const source = read(file);
    assert.match(source, /distanceToRouteMeters\(navigationRoute, report\) < 75/);
    assert.match(source, /isAhead\(gps\.point, report\)/);
    assert.match(source, /setTimeout\(finishDrive, 1000\)/);
    assert.match(source, /Arrival confirmed · saving your drive/);
  }
  const web = read('src/screens/MapScreen.web.tsx');
  assert.match(web, /reported ahead in \$\{distance\} meters/);
  assert.match(web, /speechSynthesis\.speaking/);
});
