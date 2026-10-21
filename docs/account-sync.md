# CUBO account sync

CUBO keeps an offline copy on each device and mirrors bounded, user-owned records to Cloud Firestore under `users/{uid}/sync/{domain}`. The signed-in Firebase UID is the ownership boundary. A client cannot read or write another user's sync documents.

## Synced in Expo

- saved vehicles and selection;
- Home, Work, and the three most recent chosen destinations;
- insurance demo preferences;
- Blocked Apps policies and preview notices;
- up to 50 recent completed drives, with sampled route points and safety events.

The web build additionally syncs its bounded Cubo Assistant text history, saved notes, and weekly counter. Existing local records seed an empty cloud record. A fresh install takes the account copy. Each device stores the last cloud payload it confirmed so real offline edits and deletions upload after reconnection instead of being silently replaced or resurrected.

## Never synced by this layer

Camera frames, raw microphone audio, active-drive location updates, OS permission state, camera calibration, CUBO Cruise pairing, map tiles, optional WebLLM model files, drafts, and profile photos remain device-local. Calibration, permissions, map source, and hardware state are intentionally device-specific. Firebase Storage is not used, so this remains compatible with the Spark plan.

## Free-tier controls

Each domain is one versioned JSON envelope with a rules-enforced maximum size. Writes are debounced, completed drives sync instead of live GPS samples, and arrays are bounded before upload. If Firestore is unavailable or quota is exhausted, CUBO continues locally and retries after the app is reopened or the data changes again.

The Firestore database is Standard edition. Deploy `firestore.rules` before releasing client code; otherwise the existing catch-all denial blocks all sync writes.
