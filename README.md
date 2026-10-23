# CUBO

**Your attention. On the road.**

CUBO is a student-built driving-safety app with route guidance, experimental camera-based attention monitoring, trip insights, and a personal assistant. This branch contains the current standalone web app, built with Expo and React Native Web and hosted on Cloudflare Pages.

**[Open CUBO](https://cubo-app-cac.pages.dev/)**

Visitors do not need Expo Go, a development server, or a connection to the developer's laptop. An internet connection, an account, and a compatible browser are required. Camera, location, microphone, and optional general-AI capabilities depend on device support and permission.

> CUBO is an experimental prototype—not a certified safety device or a replacement for attentive driving. Set up and test while parked. Never deliberately look away or close your eyes while driving to test detection.

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Current premium-interface web release. GitHub pushes trigger the Cloudflare Pages production deployment. |
| `shashank-new-ui` | Recoverable premium web-interface branch. Continue new-UI work here, then promote reviewed app revisions to `main`. |
| `shashank-old-ui` | Preserved pre-redesign Cloudflare web app. Use only for comparison or temporary rollback. |
| `shashank-expo` | Separate native Expo / Expo Go app. It is intentionally not part of this web redesign and must not be replaced with a web branch. |
| `old-rsa-app` | Historical original/RSA-era implementation. Archive/reference only. |

See [`docs/branch-map.md`](docs/branch-map.md) before merging or asking an AI agent to change branches. Expo and web share concepts and substantial code, but platform-specific files, dependencies, and permissions must be tested separately. Do not replace one platform's setup with the other's.

For interface work, read [`DESIGN.md`](DESIGN.md) and the [approved mockup contract and verification](docs/mockup-fidelity-2026-10-22.md). The current interface uses the full-width forest score cockpit, cinematic dusk welcome, unified map sheet, and five primary tabs. The earlier small-card Home and aerial-road welcome are not the current design targets.

## Use CUBO on your phone

1. Open [cubo-app-cac.pages.dev](https://cubo-app-cac.pages.dev/).
2. Create an account or sign in.
3. **iPhone:** open in Safari, tap **Share → Add to Home Screen**, enable **Open as Web App** if offered, then tap **Add**.
4. **Android:** open in Chrome and use **Add to Home screen** or **Install app**, if offered.
5. Configure permissions and complete camera calibration while parked before testing a drive.

Installation is optional; the link also works in the browser. Home Screen installation does not remove browser restrictions or enable reliable background monitoring. The current web app is online-only.

To invite another person, open **Account → Support → Invite someone**. Preview a personalized message with the public link and setup steps, then **Copy invitation** or **Share** using an available app. This does not enroll anyone in your family or share private trip data.

## What's in the current app

### Home, garage, and account

- Five primary tabs: Home, Map, Activity, Garage, and Account. Home includes Cubo Assistant, saved Home/Work addresses, vehicles, Family/Friends connections, camera calibration, and starting a drive.
- Vehicle selection, vehicle-detail views, and a separate vehicle-color control.
- Light, dark, and system appearance, plus profile and account settings.
- Camera/microphone access controls, map-source preference, and a voice preference with a **Hear Voice** sample.
- Blocked Apps preferences, including parent-managed **Child Lock** controls; real phone-level enforcement still requires native operating-system integration.
- Firebase email/password authentication and account-detail persistence.

### Maps and driving

- Full-screen **MapLibre GL JS** maps using **OpenFreeMap** styles, with light/dark map palettes.
- Address suggestions, saved places, and the three latest distinct destinations.
- Route previews, maneuver instructions, location/heading follow, recentering, speed, and trip time.
- Camera picture-in-picture, road-hazard reporting, and supported voice route questions and alternate-route requests.
- Trip summaries with a street-map preview, recorded route, and hazard/attention markers where location data exists.

Search uses **Photon**; routing uses **OSRM**. These are separate services from the map renderer and tiles. Public endpoints have their own availability and usage limits. CUBO does not provide guaranteed traffic-aware routing, precise arrival times, or offline navigation.

The browser uses **Web** maps. Apple's native map renderer belongs to the iOS Expo version, not the Cloudflare app.

### Attention monitoring and calibration

- MediaPipe Face Landmarker processes camera frames locally to estimate head movement and eye closure.
- Guided parked calibration collects a forward-facing baseline, prompts a sustained head turn, plays an audible alert, observes recovery, and asks whether the alert was heard.
- Driving alerts require fresh location data and speed of at least **3 mph**. The parked calibration exercise intentionally works without that driving threshold.
- Missing faces, unavailable GPS, stale measurements, and interrupted cameras are reported rather than treated as attentive driving.
- Focus scores reflect measured attentive moving time; unobserved time is excluded and measurement coverage matters.

This is heuristic monitoring, not a medical diagnosis or validated eye-gaze measurement. The current app does **not** integrate the older YOLO phone-object detector. Audio delivery depends on volume, output devices, browser policies, and phone behavior.

### Activity and trip history

- Completed trips, duration, distance, measured focus information, and drive events.
- Account-scoped local checkpoints for interrupted-trip recovery.
- Local Voice Assist transcripts accessible from trip details when recorded.
- Map previews load street tiles when displayed; they are not permanently saved offline map images.

### Cubo Assistant and Cubo Voice Assist

- Typed app questions use preset, account-aware answers first: vehicles, saved scores, profile, saved places, Family/Friends connections, insurance settings, calibration, and app help.
- The microphone beside the composer dictates text for review before sending.
- **Voice Assist** is a separate spoken-conversation mode with consent and the selected reply voice.
- Destination requests can ask for confirmation before switching to Map with a selected destination.
- During a drive, supported voice commands use the active route and trip context. Hazard reports and spoken voice-off requests require confirmation.
- An optional general-AI mode uses **WebLLM** and a Llama model in a dedicated browser worker. It is not required for preset answers or drive voice commands.

General AI needs compatible WebGPU support and an initial model download. Cached files can be evicted by the browser; performance and memory stability vary by phone. No paid inference API key is required, but model licenses and download-host policies still apply.

Chat has a local **100-attempt weekly allowance**, resetting Monday at 00:00 UTC without clearing history. This includes preset chat replies and is not a server-enforced billing limit. Drive voice commands do not consume this chat allowance.

Voice recognition is browser-dependent and may process speech through the browser provider's servers. It is not guaranteed offline speech, unrestricted language understanding, or a reliable background wake-word service. No raw conversation audio is saved by CUBO.

## What is still a demo or limited

- **Family/Friends:** connections use separate join codes and permission controls. Shared location is an updated snapshot, not guaranteed continuous background tracking; scores depend on recorded drives and sharing rules.
- **Insurance:** insurer selection, savings, and reporting previews do not establish actual discounts or submit insurer reports.
- **CUBO Cruise:** device screens and recognition groundwork are present; production hardware pairing is not enabled.
- **App blocking:** the web app cannot block other apps on a phone.
- **Delivery:** static Cloudflare Pages does not run the optional family backend or automatically provide email, SMS, or feedback delivery.
- **Background operation:** iOS and other browsers may suspend camera, location, and microphone work when hidden or locked.
- **Reliability:** automated tests do not certify real-world driving safety, detection accuracy, or compatibility with every phone.

## Data and privacy

| Data | Current handling |
| --- | --- |
| Sign-in and account details | Firebase Authentication and Firestore, with local account-detail caching. |
| Vehicles, saved places, insurance, Blocked Apps, and completed trip history | Bounded owner-only Firestore account sync with a device/browser offline copy. Completed routes are sampled before upload; active-drive GPS is not continuously uploaded. |
| Calibration | Numeric measurements saved locally per account; calibration photos are not retained. |
| Camera monitoring | Local frame analysis; camera frames are not uploaded as trip history. Model/runtime loading needs network access. |
| Assistant chats, notes, and allowance | Latest bounded text state syncs through the signed-in Firestore account and remains cached locally. The optional model and interrupted drafts stay device-local. |
| Voice preference | Account-scoped browser storage because installed system voices differ by device. |
| Drive voice transcripts | Bounded text is retained with completed trips and included in owner-only account sync; raw audio is never stored by CUBO. |
| Community road reports | Firestore-backed features depend on deployed rules and indexes. Voice hazard reports are local trip events, not automatic community posts. |
| Maps, address search, and routing | External providers receive requests needed for the viewed area, search, or route. |

Clearing browser/site data can remove local history and preferences. Account-scoped local storage is not encrypted cloud backup or protection against someone with access to the browser profile.

Firebase's frontend configuration is public by design; it is not an administrator credential. Access control depends on Authentication, deployed security rules, and appropriate restrictions. Never commit private tokens, passwords, service-account files, or local agent/session data.

See [`docs/account-sync.md`](docs/account-sync.md) for migration behavior, free-tier limits, synced domains, and intentionally device-local data.

## Run the web app locally

Use Node.js and npm. Current locked Firebase dependencies declare **Node 24.12.0 or newer**; prefer a supported Node version satisfying the lockfile's engine requirements. The existing Cloudflare build has used Node 22.16.0 with engine warnings—successful deployment is not proof of full dependency support.

```sh
git clone https://github.com/ShashankM7/CUBO-APP-CAC.git
cd CUBO-APP-CAC
git switch main
npm ci
npm run web
```

For the production export and local preview:

```sh
npm run build:web
npm run preview:web -- 8091
```

Open **http://127.0.0.1:8091**. This preview binds to the local computer, not the phone's network. Use deployed HTTPS for phone testing; insecure LAN HTTP may not allow camera/microphone features.

### Backend configuration for a separate deployment

The checked-in client currently points at CUBO's Firebase project. A fork is not an isolated backend:

1. Configure your own Firebase project and update `src/lib/firebase.ts` with its public web-client configuration.
2. Enable the required Authentication provider and authorize your deployment hostname.
3. Review and test Firestore rules/indexes for the actual features you enable.
4. Leave `EXPO_PUBLIC_FAMILY_API_URL` unset unless you have separately deployed and secured the optional family API.

Do not put private credentials in `EXPO_PUBLIC_*`; those values ship to browsers. **A GitHub push or Cloudflare deploy does not deploy Firestore rules.** Do not overwrite a richer live ruleset blindly with a partial repository rules file.

## Cloudflare Pages deployment

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build:web` |
| Build output directory | `dist` |
| Root directory | Repository root |
| Public app | [cubo-app-cac.pages.dev](https://cubo-app-cac.pages.dev/) |

Review web changes on `shashank-new-ui`, then promote the exact reviewed app revision to `main` and push. Confirm the production deployment succeeds for that revision. Native-only branches such as `shashank-expo` should be excluded from Pages preview builds.

The build exports the Expo web app, bundles the optional AI worker, and prepares assets, headers, and install metadata. **Do not skip `scripts/prepare-web.cjs`**: it relocates dependency assets so fonts and icons survive Cloudflare's upload exclusions.

Hosting and external services have their own quotas and policies; this repository does not promise unlimited free deployment or service usage.

## Validation

```sh
npx tsc --noEmit
npm run build:web
node --test tests/*.test.cjs
```

Build first because the web-build tests inspect `dist`. Coverage includes attention policies, calibration, account isolation, trip recovery, address suggestions, map behavior, assistant commands, voice confirmations, navigation, invitations, and repository safeguards.

Also test on a parked physical phone: sign-in persistence, permissions allowed/denied, calibration and audible alerts, voice confirmation/cancellation, map loading, safe areas, and recovery after backgrounding. Desktop checks cannot establish iPhone camera, microphone, GPU, or GPS reliability.

## Repository guide

```text
App.tsx                 App entry and providers
src/screens/            Home, Map, Activity, Account, assistant and detail screens
src/components/         Shared controls and platform-specific UI
src/features/           Auth, attention, calibration, trips, maps, voice, and app data
src/navigation/         Screen routes and navigation
src/theme/              Appearance and shared color tokens
src/lib/firebase.ts     Public Firebase client initialization
public/                 Web assets, install metadata inputs, and bundled licenses
scripts/                Web export preparation, AI worker build, and preview server
server/family/          Optional backend groundwork; not hosted by static Pages
tests/                  Automated regression checks
docs/                   Feature notes, deployment guidance, and historical handoffs
```

Useful references:

- [Web deployment](docs/STANDALONE-WEB.md)
- [Maps and route summaries](docs/WEB-MAPS.md)
- [Attention monitoring and recovery](docs/ATTENTION-AND-RECOVERY.md)
- [Guided calibration](docs/calibration-guided-test.md)
- [Assistant inputs](docs/cubo-assistant-inputs.md) and [preset answers](docs/cuboai-quick-answers.md)
- [Drive voice commands](docs/drive-voice-commands.md)
- [App invitations](docs/app-invitation.md)
- [Repository security](docs/repository-security.md)

Some older feature notes use historical names such as “CuboAI,” “Expo main,” or “standalone only,” and contain test counts from their implementation date. Use the branch table above and current source for today's platform roles.

## Attribution

Keep map-provider attribution and the bundled third-party notices intact. Optional Llama-powered general AI retains its **Built with Llama** attribution and license in the app. This README describes the current implementation, not the historical app's demo video or separate detector experiments.
