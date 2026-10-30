import { randomBytes } from "node:crypto";

/**
 * WATI's own API (Dashboard → API Docs). The endpoint looks like
 * https://live-mt-server.wati.io/123456 and the token is shown there as
 * "Bearer eyJ…". Admins paste both as-is; these helpers clean them up.
 */

/** 32 random bytes, URL-safe: the secret part of a connection's webhook URL. */
export function newWebhookKey(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The pasted API endpoint, or null if it isn't a WATI https URL. Only WATI's
 * own hosts are accepted: the server calls this URL with the account's token,
 * so it must never be pointed anywhere else.
 */
export function cleanEndpoint(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== "wati.io" && !url.hostname.endsWith(".wati.io")) return null;
  // WATI shows the tenant URL; people sometimes copy it with an /api/v1/... tail.
  const path = url.pathname.replace(/\/api\/.*$/, "").replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

/** The pasted token without any "Bearer " prefix, or null if empty. */
export function cleanToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/^bearer\s+/i, "").trim();
  return t.length >= 10 && t.length <= 4000 ? t : null;
}

/**
 * One chat's latest messages (newest first), or null on any failure. Accounts
 * with several numbers need `channelPhone`, or WATI answers "Can't find
 * Conversation". Never throws, and never logs WATI's error text — it echoes
 * the customer's phone number back.
 */
export async function fetchChat(
  endpoint: string,
  token: string,
  phone: string,
  channelPhone: string | null
): Promise<unknown | null> {
  const qs = new URLSearchParams({ pageSize: "50", pageNumber: "1" });
  if (channelPhone) qs.set("channelPhoneNumber", channelPhone);
  try {
    const res = await fetch(`${endpoint}/api/v1/getMessages/${phone}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { result?: unknown } | null;
    return body && body.result !== false ? body : null;
  } catch {
    return null;
  }
}

/**
 * Asks WATI for one contact — the cheapest call that proves the endpoint and
 * token work together. Never throws.
 */
export async function testWatiApi(
  endpoint: string,
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${endpoint}/api/v1/getContacts?pageSize=1&pageNumber=1`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "WATI refused the token." };
    }
    if (res.status === 404) {
      return { ok: false, error: "WATI doesn't recognise that API endpoint." };
    }
    return { ok: false, error: `WATI answered ${res.status}.` };
  } catch {
    return { ok: false, error: "Couldn't reach WATI." };
  }
}
