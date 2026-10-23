# New UI surface brief

## Scope and mode

Operate-mode visual replacement for CUBO's shared mobile shell, welcome, Home, Map, Drive Activity, Garage, and Account surfaces. Functional behavior and backend contracts are out of scope.

## Direction contract

**THESIS:** CUBO becomes a map-aware safety companion whose interface feels as composed as a modern vehicle cabin. It refuses the category default of repeated soft cards on a pale page; important state owns the surface while supporting actions recede.

**OWN-WORLD:** Deep forest, mineral white, graphite, and signal green define the shell. Light mode uses cool mineral surfaces; dark mode uses green-black rather than pure black. Controls are native, compact, and deliberate, with one consistent corner family and strong typographic contrast.

**STORY:** A driver immediately sees safety readiness, the next useful action, and live map context. Search, start-drive, assistant, family, activity, vehicles, and account features remain familiar and predictable. Motion communicates state changes, never decoration.

**FIRST VIEWPORT:** Home opens with an immersive safety field rather than a stack of equal cards: identity and utilities sit above a dominant safety score, a single contextual message, and a map-led destination action. The floating tab bar stays reachable. Map keeps the map full-bleed and concentrates search and drive controls into one bottom sheet.

**FORM:** Brief-pinned Tesla Robotaxi operate system, translated through CUBO's green identity and the supplied map, dashboard, and commerce references. Seed key: `brief-pinned-tesla-robotaxi-operate`. Signature move: the safety field subtly shifts its green light and depth as score and drive state change.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Constraints

- UI-only redesign work originates on `shashank-new-ui` and is promoted unchanged to `main` after review.
- Preserve every route, control, backend call, and data state.
- Portrait-first, responsive web and native-compatible React Native.
- No copied Tesla, Mobbin, Klarna, or Bump branding.
