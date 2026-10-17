export const CUBO_INVITE_URL = 'https://cubo-app-cac.pages.dev/';

export function createInvitation(displayName?: string | null): string {
  const name = displayName?.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
  return [
    name ? `${name} is inviting you to join CUBO!` : "You're invited to join CUBO!",
    'A little more focus. A safer drive.',
    CUBO_INVITE_URL,
    'On iPhone: open this link in Safari, tap Share, then Add to Home Screen. Turn on Open as Web App if shown, then tap Add. CUBO will appear on your Home Screen.',
    'On Android: open the link in Chrome and choose Add to Home screen or Install app from the menu.',
    'You can also use the link in your browser. Create your own account to get started; camera and microphone access are optional until you use those features.',
    'See you on CUBO!',
  ].join('\n\n');
}
