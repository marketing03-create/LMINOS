/**
 * Google OAuth for the Google Ads API — refresh-token → access-token exchange.
 *
 * Mirrors src/lib/zoho/auth.ts: we hold a long-lived refresh token
 * (GOOGLE_ADS_REFRESH_TOKEN) obtained once via the consent flow, mint short-
 * lived access tokens on demand, and cache them in-process until shortly
 * before expiry.
 *
 * Env:
 *   GOOGLE_ADS_CLIENT_ID        OAuth client id (Desktop app)
 *   GOOGLE_ADS_CLIENT_SECRET    OAuth client secret
 *   GOOGLE_ADS_REFRESH_TOKEN    long-lived refresh token (from gads:exchange)
 *   GOOGLE_ADS_DEVELOPER_TOKEN  Google Ads API developer token (from the MCC)
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID  manager (MCC) account id, digits only
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const ADWORDS_SCOPE = "https://www.googleapis.com/auth/adwords";
/** Default loopback redirect; register this on the OAuth client. */
export const DEFAULT_REDIRECT_URI = "http://localhost";

type CachedToken = { accessToken: string; expiresAt: number };
// Cache keyed by refresh token so each account's token (the global env token
// plus any per-account tokens) caches independently.
const tokenCache = new Map<string, CachedToken>();

/**
 * Mint an access token from a SPECIFIC refresh token (used for per-account
 * credentials). The OAuth client id/secret are shared (one app); only the
 * user's refresh token differs.
 */
export async function getAccessTokenForRefreshToken(
  refreshToken: string
): Promise<string> {
  const hit = tokenCache.get(refreshToken);
  if (hit && hit.expiresAt - Date.now() > 120_000) {
    return hit.accessToken;
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET must be set");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Google token refresh failed: HTTP ${res.status} ${
        json.error_description ?? json.error ?? JSON.stringify(json).slice(0, 200)
      }`
    );
  }

  const token: CachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  tokenCache.set(refreshToken, token);
  return token.accessToken;
}

/** Access token from the global GOOGLE_ADS_REFRESH_TOKEN (default credentials). */
export async function getGoogleAdsAccessToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("GOOGLE_ADS_REFRESH_TOKEN must be set");
  }
  return getAccessTokenForRefreshToken(refreshToken);
}

/**
 * Build the consent URL the operator opens once to authorize offline access.
 * After approving they are redirected to `${redirectUri}/?code=...`; copy the
 * `code` and hand it to gads:exchange.
 */
export function consentUrl(input: {
  clientId: string;
  redirectUri?: string;
  loginHint?: string;
}): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", input.clientId);
  u.searchParams.set("redirect_uri", input.redirectUri ?? DEFAULT_REDIRECT_URI);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", ADWORDS_SCOPE);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  // Pre-select the owning account → avoids the multi-account 400 on consent.
  if (input.loginHint) u.searchParams.set("login_hint", input.loginHint);
  return u.toString();
}

/**
 * One-time: exchange an authorization code for a refresh token.
 * Called by the gads:exchange script, not at runtime.
 */
export async function exchangeAuthCodeForRefreshToken(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}): Promise<{ refreshToken: string; accessToken: string }> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri ?? DEFAULT_REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.refresh_token) {
    throw new Error(
      `Google code exchange failed: HTTP ${res.status} ${
        json.error_description ?? json.error ?? JSON.stringify(json)
      } — note a refresh_token is only returned with access_type=offline & prompt=consent`
    );
  }
  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token ?? "",
  };
}
