export async function copyInvitation(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Copy unavailable');
  await navigator.clipboard.writeText(text);
}

export async function shareInvitation(text: string): Promise<'opened' | 'cancelled' | 'unavailable'> {
  if (!navigator.share) return 'unavailable';
  try {
    await navigator.share({ title: 'Join me on CUBO', text });
    return 'opened';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}
