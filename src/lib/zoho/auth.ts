/**
 * Zoho OAuth — refresh-token → access-token exchange.
 *
 * We store a long-lived refresh token (ZOHO_REFRESH_TOKEN) obtained once via
 * the Self Client flow. Access tokens last ~1 hour, so we mint one on demand
 * and cache it in-process until shortly before expiry.
 *
 * Data center matters: the OAuth + accounts endpoints live on the same TLD as
 * the user's Zoho account (.com, .com.au, .eu, .in, .jp). Configure via
 * ZOHO_ACCOUNTS_DOMAIN (default accounts.zoho.com).
 */

type CachedToken = { accessToken: string; expiresAt: number };
let cache: CachedToken | null = null;

function accountsBase(): string {
  return process.env.ZOHO_ACCOUNTS_DOMAIN ?? "https://accounts.zoho.com";
}

export async function getZohoAccessToken(): Promise<string> {
  // Reuse cached token if it has >2 min of life left.
  if (cache && cache.expiresAt - Date.now() > 120_000) {
    return cache.accessToken;
  }

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN must be set"
    );
  }

  const url = new URL(`${accountsBase()}/oauth/v2/token`);
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Zoho token refresh failed: HTTP ${res.status} ${json.error ?? JSON.stringify(json).slice(0, 200)}`
    );
  }

  const expiresInMs = (json.expires_in ?? 3600) * 1000;
  cache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + expiresInMs,
  };
  return cache.accessToken;
}

/**
 * One-time helper: exchange a Self Client authorization code for a refresh
 * token. Called by the bootstrap script, not at runtime.
 */
export async function exchangeAuthCodeForRefreshToken(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  accountsDomain?: string;
}): Promise<{ refreshToken: string; accessToken: string; apiDomain?: string }> {
  const base = input.accountsDomain ?? "https://accounts.zoho.com";
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "authorization_code",
  });
  const res = await fetch(`${base}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    api_domain?: string;
    error?: string;
  };
  if (!res.ok || !json.refresh_token) {
    throw new Error(
      `Zoho code exchange failed: HTTP ${res.status} ${json.error ?? JSON.stringify(json)}`
    );
  }
  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token ?? "",
    apiDomain: json.api_domain,
  };
}
