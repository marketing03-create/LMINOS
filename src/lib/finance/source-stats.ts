/**
 * Source Statistics API (Finance Connect) — approved loans and lead outcomes
 * per marketing source. SERVER-ONLY.
 *
 *  1. POST /external/auth/token with FINANCE_CONNECT_CLIENT_ID / _SECRET →
 *     a Bearer token valid 1 hour, kept in memory and reused.
 *  2. GET /external/v1/source-stats?date_from&date_to[&platform] (Malaysia
 *     days, ≤ 366 days).
 * Answers are cached in `source_stats_cache` (core.maxAgeMs) — the API asks
 * for about one call a day. Never logs the secret, the token or a response body.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sourceStatsCache } from "@/db/schema";
import { maxAgeMs, parseSourceStats, statsKey, type SourceStats } from "./source-stats-core";

const BASE = "https://api.financeconnect.work";

export function sourceStatsConfigured(): boolean {
  return !!(process.env.FINANCE_CONNECT_CLIENT_ID && process.env.FINANCE_CONNECT_CLIENT_SECRET);
}

/** A failure the page can show as is (no secrets, no API body). */
export class SourceStatsError extends Error {}

const MESSAGES: Record<string, string> = {
  "external.auth.invalid": "Finance Connect refused the client ID or secret.",
  "external.scope.denied": "This login doesn't include Source Statistics yet — ask Finance Connect to enable it.",
  "external.client.revoked": "This Finance Connect login has been switched off.",
  "external.rate.limited": "Finance Connect is busy — try again in a minute.",
  "validation.failed": "Finance Connect didn't accept that date range.",
};

let token: { value: string; until: number } | null = null;

async function call(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new SourceStatsError("Couldn't reach Finance Connect.");
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw new SourceStatsError(`Finance Connect answered ${res.status}.`);
  return body;
}

async function getToken(force = false): Promise<string> {
  if (!force && token && token.until > Date.now()) return token.value;
  const body = await call("/external/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.FINANCE_CONNECT_CLIENT_ID,
      client_secret: process.env.FINANCE_CONNECT_CLIENT_SECRET,
    }),
  });
  const data = (body.data ?? {}) as { access_token?: unknown; expires_in?: unknown };
  if (body.status !== 1 || typeof data.access_token !== "string") {
    throw new SourceStatsError(MESSAGES[String(body.system)] ?? "Finance Connect login failed.");
  }
  const life = typeof data.expires_in === "number" ? data.expires_in : 3600;
  // Renew 5 minutes early so a token never expires mid-call.
  token = { value: data.access_token, until: Date.now() + Math.max(60, life - 300) * 1000 };
  return token.value;
}

async function fetchStats(from: string, to: string, platforms: readonly string[]): Promise<unknown> {
  const qs = new URLSearchParams({ date_from: from, date_to: to });
  if (platforms.length) qs.set("platform", platforms.join(","));
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = await getToken(attempt > 0);
    const body = await call(`/external/v1/source-stats?${qs}`, { headers: { Authorization: `Bearer ${t}` } });
    const system = String(body.system);
    if (body.status === 1) return body;
    // An expired or rejected token: get a fresh one once.
    if ((system === "external.token.expired" || system === "external.token.invalid") && attempt === 0) continue;
    throw new SourceStatsError(MESSAGES[system] ?? "Finance Connect couldn't answer — try again later.");
  }
  throw new SourceStatsError("Finance Connect login failed.");
}

/** Referral partners' names are confidential: never stored, never shown. */
function withoutPartners(body: unknown): unknown {
  const b = body as { data?: { sources?: Record<string, unknown>[] } };
  if (!Array.isArray(b?.data?.sources)) return body;
  return {
    ...b,
    data: { ...b.data, sources: b.data.sources.map(({ partners: _drop, ...s }) => (void _drop, s)) },
  };
}

/**
 * Stats for [from, to] (Malaysia days, inclusive), from the cache when fresh.
 * A failed refresh falls back to an older cached answer (`stale: true`).
 */
export async function getSourceStats(
  from: string,
  to: string,
  platforms: readonly string[] = [],
  now = new Date()
): Promise<{ stats: SourceStats; fetchedAt: Date; stale: boolean }> {
  if (!sourceStatsConfigured()) throw new SourceStatsError("Finance Connect isn't connected yet.");
  const key = statsKey(from, to, platforms);
  const today = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  const [hit] = await db.select().from(sourceStatsCache).where(eq(sourceStatsCache.key, key)).limit(1);
  if (hit && now.getTime() - hit.fetchedAt.getTime() < maxAgeMs(to, today)) {
    return { stats: parseSourceStats(hit.payload), fetchedAt: hit.fetchedAt, stale: false };
  }
  try {
    const body = withoutPartners(await fetchStats(from, to, platforms));
    const stats = parseSourceStats(body);
    await db
      .insert(sourceStatsCache)
      .values({ key, payload: body, fetchedAt: now })
      .onConflictDoUpdate({ target: sourceStatsCache.key, set: { payload: body, fetchedAt: now } });
    return { stats, fetchedAt: now, stale: false };
  } catch (err) {
    if (hit) return { stats: parseSourceStats(hit.payload), fetchedAt: hit.fetchedAt, stale: true };
    if (err instanceof SourceStatsError) throw err;
    console.error("[source-stats] failed:", err instanceof Error ? err.name : "error");
    throw new SourceStatsError("Finance Connect couldn't answer — try again later.");
  }
}
