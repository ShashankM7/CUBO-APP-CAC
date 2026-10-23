# CUBO standalone web deployment

`main` is the web deployment branch. `shashank-new-ui` is its premium web-development counterpart.
`shashank-old-ui` preserves the pre-redesign web interface, while `shashank-expo` preserves the Expo Go version.
Expo still builds the source; visitors do not need Expo Go or a running laptop.

## Cloudflare Pages (free plan)

1. Open https://dash.cloudflare.com/ and choose Workers & Pages, Create application,
   then Pages / Connect to Git (not a Workers deployment).
2. Authorize only the CUBO-APP-CAC GitHub repository if possible.
3. Select production branch `main`, framework None, build command
   `npm run build:web`, output directory `dist`, root directory blank.
4. Set build environment variable `NODE_VERSION` to `22.16.0`.
5. Under preview branch controls, exclude `shashank-expo` and other native-only
   branches so Expo commits do not trigger unsupported web builds.
6. Deploy. Use the assigned HTTPS `*.pages.dev` URL; no paid domain is required.
7. In Firebase Authentication settings, add that exact hostname to Authorized
   domains. Never weaken Firestore rules to fix a login or permissions error.
8. On iPhone, open the HTTPS URL in Safari, Share, Add to Home Screen. Enable
   Open as Web App if Safari offers it. Launch CUBO from its new icon.

No secret keys or Cloudflare tokens belong in this frontend or in EXPO_PUBLIC_*
variables. The Firebase client configuration is public by design; authorization
depends on Firebase Authentication and deployed security rules.

## Verification

Run `npm ci`, `npm run build:web`, `npm run test:web-build`, and `npx tsc --noEmit`.
Test the deployed HTTPS URL on a physical iPhone, both in Safari and from its
Home Screen icon. Check login persistence, navigation, keyboard, safe areas,
camera and GPS permissions. Then switch Wi-Fi off and repeat on cellular while
the laptop is off. Set up and interact only while parked.

## Current boundaries

- This initial export is online-only. There is no offline/service-worker cache.
- Web maps use MapLibre/OpenFreeMap with routed directions, GPS-following and
  hazard markers. This is an experimental prototype, not a validated navigation system.
- Camera calibration uses a guided parked baseline, real head-turn detection,
  audible alert and forward-facing recovery. See `calibration-guided-test.md`.
  It discards images and saves measurements locally per account. Denied/interrupted
  camera access requires retry; backgrounding calibration stops its stream.
- iOS may suspend camera/GPS when backgrounded or locked. Do not rely on
  background monitoring, and do not treat this prototype as a safety device.
- Demo family locations, insurance savings and notifications remain demos.
- Static Pages hosting does not run `server/family`. Real family APIs, email,
  feedback delivery and SMS require separately configured backend services.
  Leave EXPO_PUBLIC_FAMILY_API_URL unset until a secure hosted API exists.
- Address/routing providers and Firebase need connectivity and have their own
  availability, usage policies and limits. Free frontend hosting does not remove
  those limits.

Rollback: use an earlier successful Pages deployment or inspect `shashank-old-ui`.
Keep current web code on `shashank-new-ui`/`main` and native-only setup on `shashank-expo`.

## Safari font/icon deployment regression

Expo exports dependency assets under `assets/node_modules`, which Pages omits.
`scripts/prepare-web.cjs` copies these assets to `assets/vendor` and rewrites
their bundle URLs. Do not bypass this post-export step. `test:web-build` checks
that Manrope and Ionicons are present and no bundle references the excluded path.
A font request must return font bytes, not the SPA HTML fallback with status 200.
