/**
 * Persist a captured live: upsert the session summary + insert keyword-lead
 * rows, then set the denormalized lead count. Idempotent on
 * (accountId, externalSessionId) and (sessionId, username) — re-capturing the
 * same room updates in place. Shared by the connector, CLI, and worker.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokLiveLeads, tiktokLiveSessions } from "@/db/schema";
import type { LiveLead, LiveSummary } from "./tally";

export async function persistLiveCapture(input: {
  accountId: string;
  externalSessionId: string;
  title?: string | null;
  summary: LiveSummary;
  leads: LiveLead[];
  raw?: unknown;
}): Promise<{ sessionId: string; leadCount: number }> {
  const { accountId, title, summary, leads, raw } = input;
  let externalSessionId = input.externalSessionId;

  // Belt-and-suspenders dedup: guarantee ONE row per physical live even if a
  // mid-live reconnect somehow lands under a different externalSessionId. The
  // live's START INSTANT is invariant across reconnects, so if a
  // connector-captured session with the same account + exact start already
  // exists, reuse ITS id — the upsert then MERGES into it instead of inserting a
  // second row. (Manual "past live" rows are excluded so they're never touched.)
  if (summary.startedAt) {
    const [existing] = await db
      .select({ ext: tiktokLiveSessions.externalSessionId })
      .from(tiktokLiveSessions)
      .where(
        and(
          eq(tiktokLiveSessions.accountId, accountId),
          eq(tiktokLiveSessions.startedAt, summary.startedAt),
          sql`(${tiktokLiveSessions.rawPayload}->>'manual') is null`
        )
      )
      .limit(1);
    if (existing) externalSessionId = existing.ext;
  }

  const [row] = await db
    .insert(tiktokLiveSessions)
    .values({
      accountId,
      externalSessionId,
      title: title ?? null,
      startedAt: summary.startedAt,
      endedAt: summary.endedAt,
      durationSeconds: summary.durationSeconds,
      peakViewers: summary.peakViewers,
      avgViewers: summary.avgViewers,
      totalViews: summary.totalViews,
      totalLikes: summary.totalLikes,
      totalComments: summary.totalComments,
      totalShares: summary.totalShares,
      newFollowers: summary.newFollowers,
      keywordLeads: leads.length,
      rawPayload: (raw ?? null) as object | null,
    })
    .onConflictDoUpdate({
      target: [tiktokLiveSessions.accountId, tiktokLiveSessions.externalSessionId],
      set: {
        // Keep the BEST observed values — so re-captures or a mid-live
        // reconnect never lower a metric (likes/views are cumulative; peak is a
        // max; duration grows). title/timestamps take the latest.
        title: sql`coalesce(excluded.title, ${tiktokLiveSessions.title})`,
        startedAt: sql`excluded.started_at`,
        endedAt: sql`excluded.ended_at`,
        durationSeconds: sql`greatest(${tiktokLiveSessions.durationSeconds}, excluded.duration_seconds)`,
        peakViewers: sql`greatest(${tiktokLiveSessions.peakViewers}, excluded.peak_viewers)`,
        avgViewers: sql`greatest(${tiktokLiveSessions.avgViewers}, excluded.avg_viewers)`,
        totalViews: sql`greatest(${tiktokLiveSessions.totalViews}, excluded.total_views)`,
        totalLikes: sql`greatest(${tiktokLiveSessions.totalLikes}, excluded.total_likes)`,
        totalComments: sql`greatest(${tiktokLiveSessions.totalComments}, excluded.total_comments)`,
        totalShares: sql`greatest(${tiktokLiveSessions.totalShares}, excluded.total_shares)`,
        newFollowers: sql`greatest(coalesce(${tiktokLiveSessions.newFollowers},0), coalesce(excluded.new_followers,0))`,
        rawPayload: sql`excluded.raw_payload`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: tiktokLiveSessions.id });

  const sessionId = row.id;

  if (leads.length) {
    await db
      .insert(tiktokLiveLeads)
      .values(
        leads.map((l) => ({
          sessionId,
          accountId,
          keyword: l.keyword,
          username: l.username,
          displayName: l.displayName ?? null,
          commentText: l.commentText,
          commentedAt: l.commentedAt,
        }))
      )
      .onConflictDoNothing({
        target: [tiktokLiveLeads.sessionId, tiktokLiveLeads.username],
      });
  }

  // Recompute the denormalized count from the rows actually present (idempotent).
  const [c] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tiktokLiveLeads)
    .where(eq(tiktokLiveLeads.sessionId, sessionId));
  const leadCount = Number(c?.n ?? 0);
  await db
    .update(tiktokLiveSessions)
    .set({ keywordLeads: leadCount })
    .where(eq(tiktokLiveSessions.id, sessionId));

  return { sessionId, leadCount };
}
