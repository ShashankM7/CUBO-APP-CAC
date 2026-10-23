# CUBO branch map

This file is the source of truth for humans and AI agents deciding which branch to edit.

| Branch | What it contains | Change policy |
| --- | --- | --- |
| `main` | Current Cloudflare production web app with the premium CUBO interface. | Production only. Promote tested web commits here. Cloudflare Pages watches this branch. |
| `shashank-new-ui` | Premium Cloudflare web app and the normal web-development branch. It matches the October 22, 2026 redesign release, while `main` may temporarily point at the old-UI preview. | Start ongoing web/PWA work here unless the user explicitly names another branch. Test before promoting the same app revision to `main`. |
| `shashank-old-ui` | Snapshot of the complete web app immediately before the premium interface redesign. It includes the community-hazard sync repair. | Preserve for visual comparison and rollback. Do not treat it as the normal development branch. |
| `shashank-expo` | Native Expo / Expo Go line, formerly named `expo-version`. | Keep native dependencies, maps, permissions, and packaging separate. A web release does not automatically belong here. |
| `old-rsa-app` | Historical original/RSA-era app, formerly named `old-app`. | Archive/reference only. Do not merge it into the current app. |

## Removed legacy branch

`codex/shashank-redesign` was removed during this cleanup. It had no unique commits: its October 16 onboarding/family/insurance/vehicle work was already contained in the current app, and it was 106 commits behind `main`.

## Promotion rule

For web releases, build and test `shashank-new-ui`, then move `main` to the exact reviewed app revision. Keep `main` and `shashank-new-ui` visually and functionally identical at each new-UI public release. `shashank-old-ui`, `shashank-expo`, and `old-rsa-app` are never automatic merge targets.

## Deployment map

- Cloudflare Pages production branch: `main`
- Cloudflare build command: `npm run build:web`
- Cloudflare output directory: `dist`
- Public URL: https://cubo-app-cac.pages.dev/
- Firebase is a shared backend service, not a Git branch. A Git push does not deploy Firestore rules.

## First checks in a fresh workspace

```sh
git fetch --all --prune
git switch shashank-new-ui
npm ci
npx tsc --noEmit
npm run build:web
node --test tests/*.test.cjs
```

Do not copy ignored `.env`, Firebase administrator credentials, Codex state, or local browser data into Git.
