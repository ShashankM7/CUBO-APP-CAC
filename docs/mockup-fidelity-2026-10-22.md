# Approved mockup implementation

The user rejected the previous palette/card-only implementation and explicitly requested the three previously generated screens. These are the approved visual targets, not a fresh design round.

## Reference and composition contract

- `.impeccable/mocks/approved/home.png`: forest field fills the upper half; greeting and avatar, central luminous score ring, readiness headline; destination action crosses the white boundary, then Assistant and three readiness controls. Five tabs: Home, Map, Activity, Garage, Account.
- `.impeccable/mocks/approved/map.png`: live map is the canvas; circular utilities and a single destination sheet with search, Home, Work, recent place, Start drive. No idle speed/GPS telemetry card. Actual route preview replaces mock route artwork.
- `.impeccable/mocks/approved/welcome.png`: dusk SUV photograph, centered wordmark/tagline, real Sign in and Create account actions. No carousel or competing marketing paragraph.

At 375px wide, Home's hero is approximately 422px tall, ring 252px including its orbit, search 68px high. Map sheet height follows its real content and stays above primary navigation. Welcome uses the full-screen image and proportional placement of identity and actions. Account extends the forest-header/neutral-body system without inventing another visual direction.

## Truth and accessibility

The mockup's name, score, addresses, avatar, route, and hazards are examples, never seeded data. Display the signed-in account's real values; new accounts start at 100. Location is on demand, app blocking is configured rather than falsely claimed to be enforced. Camera calibration is not proof of active camera access. Real backend contracts, permissions, drive protections and family controls remain unchanged. Text and controls are semantic, not baked into screenshots. Motion is transform/opacity, one-shot, and reduced-motion aware.

## Asset provenance

`assets/welcome/cubo-dusk.webp` derives from the approved welcome image using the built-in image generation tool, followed only by WebP encoding (832x1890, quality 84, 47,770 bytes). The generated source is `exec-c26d48a8-aff5-40d6-9e6c-a1afed8b0d48.png`.

Exact edit prompt: "Use case: precise-object-edit. Edit target: supplied CUBO welcome mockup. Produce the clean photographic BACKGROUND PLATE for implementing that exact screen in code. Remove ALL text, the CUBO wordmark, tagline, Sign in button and Create account button including their outlines/backgrounds. Fill those regions naturally with the existing sky and dark road. Keep the exact portrait composition, SUV position/scale, dusk sky, orange horizon, green headlights and green reflections, road, lighting and all other scene details unchanged. No text, no logo, no UI, no watermark. Preserve the very dark lower road negative space for real buttons overlaid later. This is a background asset, not a redesigned UI."

The local Impeccable launcher failed before loading context (`cache_directory_failed`); source guidance was read directly. Approval and reference provenance are recorded here rather than falsely claiming automated phase gates ran.

## Publishing scope

Only shashank-new-ui and main receive this revision. No Expo, old UI, Firebase rules, schema, or deployment configuration changes are intended.

## Verification and finish review

- Production export and TypeScript check passed; 207 automated tests passed after the completed export. These include source contracts and functional tests, not a claim of 207 real-device scenarios.
- Chrome tab-only checks covered sign-in/sign-up entry, five tabs, Home-to-Assistant, saved destination route preview, and actual rendered Home, Map, Account, and Welcome.
- The independent review accepted the approved composition and found one material compact-screen issue: map utilities overlapped as the sheet grew. The fix places four controls in a compact toolbar below 680px height and caps the idle sheet with scrollable content. Active-drive card layout remains unchanged.
- The reviewer scored that issue resolved and returned `ship` after corrected idle, expanded-recents, location-error/footer, and reduced-height captures. The 320x360 check simulates reduced viewport space; it is not a physical software-keyboard test.
- Physical iPhone safe areas, live driving, microphone/camera operation, and measured animation performance were not revalidated in this visual-only release.
- Web map drawing-buffer density is normalized and capped at 2x. This fixed blank rendering at fractional desktop zoom and limits GPU buffer memory on 3x displays, with a possible slight map sharpness tradeoff on those screens.
- Actual signed-in screenshots are private local evidence under the ignored `.impeccable/review/fidelity/` directory; only illustrative approved mockups are committed.
