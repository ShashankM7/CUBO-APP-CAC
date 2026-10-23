# Drive voice interface preview

Historical scope: the web standalone line. This behavior is now present in `main`, `shashank-new-ui`, and the preserved `shashank-old-ui` snapshot.

## Direction contract

THESIS: Prepare voice controls without distracting from navigation or implying that unconnected features work.
OWN-WORLD: Existing Manrope typography, theme surfaces, green accents and CUBO asset. No new visual identity.
STORY: After confirming the camera, optionally test microphone sound levels while parked. Continue or skip. The microphone stops before starting the drive.
FIRST VIEWPORT: Existing drive map remains. The bottom control row reads End drive, an icon-only AI preview switch, then a half-width hazard icon. The AI switch fills green when selected, with a short microphone-off notice below; no CUBO logo or separate voice pill. The optional setup dialog centers within the viewport and scrolls on small screens.
FORM: Local extension of existing Operate surfaces; no concept seed needed. A real horizontal meter rather than simulated animation.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Lifecycle and integration boundary

- Meter uses getUserMedia only after Test microphone. Audio is analyzed locally, not recorded or uploaded.
- Stop on close, continue, skip, hidden page, unmount, or after 15 seconds of testing. Late permission grants release their tracks.
- Drive switch is a UI preview, explicitly not listening; no microphone or WebLLM is started by it.
- Future voice implementation must wire real listening state, permissions, interruptions, account isolation and confirmed actions. Do not reinterpret this UI state as microphone consent.
- Existing Ionicons are reused; no new image or model assets.

## Verification and limits

This is an ordinary extension, not a new visual world: existing theme tokens and assets are preserved; no new global DESIGN.md is needed. Source review and documentation review completed, with an error-text contrast correction. Typecheck, web build and 70 tests passed. The setup heading and buttons use the existing separately registered Manrope faces. The compact controls and deterministic demo-family answers received a source-only recheck; rendered phone UI and Safari stability remain unverified.

Chrome inspection failed with a browser connection timeout; the alternate browser was not signed in. No rendered approval is claimed. Small-screen scrolling, camera/locate separation and focus restoration are source-supported design intentions, not visually verified results. Real iPhone microphone permissions and camera/mic coexistence still need device testing.
