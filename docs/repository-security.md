# Repository security hygiene

The public repository contains source code, tests and deliberately shared documentation.
It must not contain Codex login/session data, personal conversations, passwords,
private API tokens, service-account credentials or local user-data exports.

## Before publishing

- Keep real environment values in ignored `.env` files. Committed
  `.env.example`, `.env.sample` and `.env.template` files must use placeholders only.
- Keep local agent state in `.codex/`, test worktrees in `.validation/`, and
  authentication caches out of Git. Do not use `git add -f` to bypass these rules.
- Review `git diff --cached` before every commit. Ignore rules do not remove
  already tracked files, erase Git history, or detect secrets embedded in ordinary source.
- Never put a private secret in `EXPO_PUBLIC_*`: those values are bundled into the app.
- Use deployment secret settings or an appropriately secured backend for private credentials.
- If a real secret is committed, revoke/rotate it first. Removing the current file
  alone does not remove it from previous commits or other people's clones.
- Do not paste secrets into public issues, pull requests, screenshots or build logs.

Firebase's client configuration in `src/lib/firebase.ts` is intentionally public.
It does not grant administrator access. Protect user data with authentication,
security rules and appropriate API-key restrictions. Never use the public client
key as a private server credential or as an unrestricted key for unrelated paid APIs.
See https://firebase.google.com/docs/projects/api-keys.

Run `node --test tests/repository-hygiene.test.cjs` to check the ignore safeguards.
This is a regression check, not a complete secret scanner or a live permissions audit.
Keep these safeguards on both `main` (web) and `expo-version` (native).
