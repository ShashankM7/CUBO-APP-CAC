const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('notifications can be deleted individually or cleared with confirmation', () => {
  const screen = read('src/screens/NotificationsScreen.tsx');
  const storage = read('src/features/notifications/notificationDismissals.ts');

  assert.match(screen, /Delete \$\{title\} notification/);
  assert.match(screen, /Clear all notifications/);
  assert.match(screen, /Clear all notifications\?/);
  assert.match(screen, /saveDismissedNotificationIds/);
  assert.match(storage, /AsyncStorage\.setItem/);
});
