/**
 * EulerStream sign-server options for TikTokLiveConnection. When
 * EULER_SIGN_API_KEY is set, every TikTok connection authenticates via the
 * account's own EulerStream key — far steadier connections + higher rate limits
 * than the shared free signer (which is what caused silent disconnects). When
 * unset, the library falls back to the free signer (previous behaviour).
 */
export function signConnectionOptions(): { signApiKey?: string } {
  const key = process.env.EULER_SIGN_API_KEY;
  return key ? { signApiKey: key } : {};
}
