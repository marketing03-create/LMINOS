/**
 * TikTok LIVE sync → `tiktok_live_sessions`. Polls the managed vendor for each
 * active handle's finished live sessions and upserts them (idempotent on
 * (accountId, externalSessionId)). Mirrors the Google Ads sync shape: per-account
 * try/catch, audit row, no persistent connection. Runs on a cron.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts, tiktokLiveSessions } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { getProvider } from "./provider";

export type TikTokLiveSyncResult = {
  provider: string;
  accounts: number;
  sessions: number;
  errors: { handle: string; error: string }[];
  days: number;
  durationMs: number;
};

const CHUNK = 200;
function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

export async function syncTikTokLive(
  opts: { days?: number } = {}
): Promise<TikTokLiveSyncResult> {
  const started = Date.now();
  const days = opts.days ?? 7;
  const sinceISO = new Date(started - days * 86_400_000).toISOString();
  const provider = getProvider();

  const accounts = await db
    .select({ id: tiktokAccounts.id, handle: tiktokAccounts.handle })
    .from(tiktokAccounts)
    .where(eq(tiktokAccounts.isActive, true));

  let sessionsWritten = 0;
  const errors: { handle: string; error: string }[] = [];

  for (const acct of accounts) {
    try {
      const sessions = await provider.listRecentSessions(acct.handle, sinceISO);
      const values = sessions.map((s) => ({
        accountId: acct.id,
        externalSessionId: s.externalSessionId,
        title: s.title ?? null,
        startedAt: s.startedAt ?? null,
        endedAt: s.endedAt ?? null,
        durationSeconds: Math.round(s.durationSeconds ?? 0),
        peakViewers: Math.round(s.peakViewers ?? 0),
        avgViewers: Math.round(s.avgViewers ?? 0),
        totalViews: Math.round(s.totalViews ?? 0),
        totalLikes: Math.round(s.totalLikes ?? 0),
        totalComments: Math.round(s.totalComments ?? 0),
        totalShares: Math.round(s.totalShares ?? 0),
        newFollowers: s.newFollowers ?? null,
        rawPayload: (s.raw ?? null) as object | null,
      }));

      for (const part of chunk(values, CHUNK)) {
        await db
          .insert(tiktokLiveSessions)
          .values(part)
          .onConflictDoUpdate({
            target: [
              tiktokLiveSessions.accountId,
              tiktokLiveSessions.externalSessionId,
            ],
            set: {
              title: sql`excluded.title`,
              startedAt: sql`excluded.started_at`,
              endedAt: sql`excluded.ended_at`,
              durationSeconds: sql`excluded.duration_seconds`,
              peakViewers: sql`excluded.peak_viewers`,
              avgViewers: sql`excluded.avg_viewers`,
              totalViews: sql`excluded.total_views`,
              totalLikes: sql`excluded.total_likes`,
              totalComments: sql`excluded.total_comments`,
              totalShares: sql`excluded.total_shares`,
              newFollowers: sql`excluded.new_followers`,
              rawPayload: sql`excluded.raw_payload`,
              updatedAt: sql`now()`,
            },
          });
      }
      sessionsWritten += values.length;

      await db
        .update(tiktokAccounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(tiktokAccounts.id, acct.id));
    } catch (err) {
      errors.push({
        handle: acct.handle,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const out: TikTokLiveSyncResult = {
    provider: provider.name,
    accounts: accounts.length,
    sessions: sessionsWritten,
    errors,
    days,
    durationMs: Date.now() - started,
  };
  await writeAudit({
    eventType: "tiktok_live.synced",
    entityType: "integration",
    entityId: "tiktok_live",
    after: { provider: provider.name, sessions: sessionsWritten, errors: errors.length },
  });
  return out;
}
