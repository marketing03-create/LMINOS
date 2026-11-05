/**
 * Load one handle's lives and build its daily report rows. SERVER-ONLY.
 * Counting rules: daily-core.ts.
 */
import { asc, eq, gte, and } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokLiveSessions } from "@/db/schema";
import { waLeadsForLives } from "@/lib/wati/leads";
import { dailyReport, mytDay, type ReportRow } from "./daily-core";

/** At most a year back — the Sheet stays quick to load. */
const MAX_DAYS = 366;

export async function handleDailyReport(accountId: string, now = new Date()): Promise<ReportRow[]> {
  const floor = new Date(now.getTime() - MAX_DAYS * 86_400_000);
  const lives = await db
    .select({
      id: tiktokLiveSessions.id,
      startedAt: tiktokLiveSessions.startedAt,
      views: tiktokLiveSessions.totalViews,
      comments: tiktokLiveSessions.totalComments,
      directMessages: tiktokLiveSessions.directMessages,
      totalLeads: tiktokLiveSessions.totalLeads,
      documents: tiktokLiveSessions.filteredLeads,
    })
    .from(tiktokLiveSessions)
    .where(and(eq(tiktokLiveSessions.accountId, accountId), gte(tiktokLiveSessions.startedAt, floor)))
    .orderBy(asc(tiktokLiveSessions.startedAt));
  const started = lives.filter((l): l is typeof l & { startedAt: Date } => l.startedAt !== null);
  if (started.length === 0) return [];

  // WhatsApp leads only where WATI actually tracked the live (else blank).
  const wa = await waLeadsForLives(started.map((l) => l.id)).catch(() => new Map());
  return dailyReport(
    started.map((l) => {
      const w = wa.get(l.id);
      return { ...l, whatsapp: w && w.tracking !== "none" ? w.waLeads : null };
    }),
    mytDay(started[0].startedAt),
    mytDay(now)
  );
}
