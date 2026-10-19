# Drive Focus app-blocking framework

This release adds the CUBO policy and user experience for choosing apps that should be unavailable during a drive. It deliberately does not claim to enforce phone restrictions yet.

## Included now

- Account-scoped Drive Focus preferences stored locally for the signed-in user.
- A premium app picker in **Account → Driving → Blocked apps**.
- Parent-managed lists and a Parent lock option from minor family profiles.
- A minor-notification preview when a parent saves a policy.
- A post-camera drive-start summary of the apps selected for that drive.
- Drive-scoped state that is cleared when the drive ends.
- Matching React Native and web behavior.

The app list uses the icon assets already bundled in `assets/block-apps`, so this change adds only a small amount of code and saved JSON. It does not add a paid service or API.

## Native enforcement still required

The current Cloudflare web app cannot block other phone apps. A later native integration must translate the saved policy into operating-system controls:

- iPhone/iPad: Apple Family Controls and Managed Settings, including Apple entitlement approval and guardian authorization for parent-managed limits.
- Android: an appropriate device-policy or accessibility-based implementation, with explicit user/guardian consent and Play policy review.

Family policies and child notifications are currently local previews. Before production enforcement, they must be synchronized through the authenticated family backend with server-side authorization so only the organizer can hard-lock a minor's policy.
