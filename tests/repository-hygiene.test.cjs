const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function ignored(paths) {
  try {
    return execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
      cwd: root, input: paths.join('\n') + '\n', encoding: 'utf8',
    }).trim().split('\n').filter(Boolean);
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}

test('private environment and credential paths stay out of Git', () => {
  const paths = [
    '.env', '.env.local', '.env.production', 'server/.env',
    '.codex/auth.json', '.codex/sessions/session.jsonl',
    '.aws/credentials', '.ssh/id_ed25519', '.azure/tokens.json',
    '.config/gcloud/application_default_credentials.json',
    '.wrangler/state/session.json', '.firebase/cache',
    'credentials.json', 'server/service-account.json',
    'server/service_account.json', 'server/serviceAccountKey.json',
    'project-firebase-adminsdk-example.json', 'certificate.pfx',
    'release.keystore', 'id_rsa', 'id_ecdsa', 'id_ed25519',
  ];
  assert.deepEqual(new Set(ignored(paths)), new Set(paths));
});

test('local validation artifacts are ignored without hiding shared project files', () => {
  const artifacts = [
    '.validation/cubo-ai-framework/local.txt', 'dist-ios-check/bundle.hbc',
    'cubo-home-preview.png', 'firebase-debug.log', 'firestore-debug.log.1', 'ui-debug.log',
  ];
  assert.deepEqual(new Set(ignored(artifacts)), new Set(artifacts));
  assert.deepEqual(ignored([
    '.env.example', '.env.sample', '.env.template', 'server/.env.example',
    'AGENTS.md', 'README.md', 'src/lib/firebase.ts', 'firestore.rules',
    'firebase.json', 'assets/cubo-logo.png', 'docs/repository-security.md',
  ]), []);
});

test('no tracked files bypass the private-file ignore safeguards', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean);
  assert.deepEqual(ignored(files), [], 'Review tracked files that are now ignored; do not print their contents.');
});
