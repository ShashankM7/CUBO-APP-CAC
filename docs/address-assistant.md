# Address search and Assistant destinations

Shared address search (`main` and `shashank-new-ui`):
- One debounced hook for Map and saved Home/Work. GPS movement does not restart typing requests.
- Keep visible results during replacement; abort old queries and ignore late responses.
- Photon provides typo-tolerant search. Preserve its text relevance and location bias; do not restrict results to a local bounding box or sort solely by distance.
- Location bias rounded to two decimals, 8-second timeout, 40-entry/two-minute memory-only cache. No new dependency or paid API.
- OpenStreetMap/Photon coverage is incomplete. No invented house numbers; include a city/ZIP for ambiguous or missing addresses.

Standalone Assistant:
- Home shortcut opens Cubo Assistant. Dictation remains separate from the labeled Voice Assist toggle.
- General AI controls are collapsed; saved-account answers and destination actions never require model inference.
- Try “Hey Cubo set the address to [place]”, “take me to [place]”, or “navigate home”.
- Public search results require an explicit option selection/confirmation. Full addresses are visible; spoken choices are short.
- Saved Home/Work and selected search matches ask “Switch to Map?” first. Only yes/confirm or the Switch to Map button opens the preview. Search never overwrites these saved addresses and never starts a drive.
- Choices expire after two minutes and are cleared on leaving chat; cancellation/account/drive guards prevent late navigation.
- Requests and replies use existing account-local history and weekly usage. No Firebase chat storage added.

Verification: mocked geocoder/confirmation tests, hook GPS-jitter and late-response regression, full existing suites, typechecks and web build. Public “Eiffel Twer Paris” lookup returned Eiffel Tower. Actual phone keyboard/microphone interaction and the user's specific street remain unverified.
