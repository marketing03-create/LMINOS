/**
 * Read queries for the TikTok Live dashboard: KPI rollups, the session list,
 * and a per-session trend series. Sessions are filtered by their start time
 * (falling back to created_at) within the chosen date range.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts, tiktokLiveSessions } from "@/db/schema";
import type { DateRange } from "@/lib/roas/aggregate";

const at = sql`coalesce(${tiktokLiveSessions.startedAt}, ${tiktokLiveSessions.createdAt})`;
function inRange(range: DateRange) {
  // Bind as ISO strings — the postgres driver won't serialize a raw Date param
  // inside a sql`` fragment (Postgres casts the text to timestamptz).
  return and(
    sql`${at} >= ${range.start.toISOString()}`,
    sql`${at} < ${range.end.toISOString()}`
  );
}

export type TikTokKpis = {
  sessions: number;
  liveHours: number;
  avgPeakViewers: number;
  totalViews: number;
  newFollowers: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  leads: number;
};

export async function tiktokLiveKpis(range: DateRange): Promise<TikTokKpis> {
  const [r] = await db
    .select({
      sessions: sql<number>`count(*)::int`,
      durationSec: sql<number>`coalesce(sum(${tiktokLiveSessions.durationSeconds}),0)::float`,
      avgPeak: sql<number>`coalesce(avg(${tiktokLiveSessions.peakViewers}),0)::float`,
      views: sql<number>`coalesce(sum(${tiktokLiveSessions.totalViews}),0)::int`,
      followers: sql<number>`coalesce(sum(coalesce(${tiktokLiveSessions.newFollowers},0)),0)::int`,
      likes: sql<number>`coalesce(sum(${tiktokLiveSessions.totalLikes}),0)::int`,
      comments: sql<number>`coalesce(sum(${tiktokLiveSessions.totalComments}),0)::int`,
      shares: sql<number>`coalesce(sum(${tiktokLiveSessions.totalShares}),0)::int`,
      leads: sql<number>`coalesce(sum(${tiktokLiveSessions.keywordLeads}),0)::int`,
    })
    .from(tiktokLiveSessions)
    .where(inRange(range));
  return {
    sessions: Number(r?.sessions ?? 0),
    liveHours: Math.round(((r?.durationSec ?? 0) / 3600) * 10) / 10,
    avgPeakViewers: Math.round(Number(r?.avgPeak ?? 0)),
    totalViews: Number(r?.views ?? 0),
    newFollowers: Number(r?.followers ?? 0),
    totalLikes: Number(r?.likes ?? 0),
    totalComments: Number(r?.comments ?? 0),
    totalShares: Number(r?.shares ?? 0),
    leads: Number(r?.leads ?? 0),
  };
}

export type SessionRow = {
  id: string;
  handle: string;
  displayName: string;
  title: string | null;
  startedAt: Date | null;
  durationSeconds: number;
  peakViewers: number;
  avgViewers: number;
  totalViews: number;
  newFollowers: number | null;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  keywordLeads: number;
  // Manually entered from the TikTok backend (null = not entered yet).
  uniqueViewers: number | null;
  activeViewers: number | null;
  avgWatchSeconds: number | null;
  directMessages: number | null;
  serviceBioViews: number | null;
  interestedViewers: number | null;
  diamonds: number | null;
};

export async function tiktokLiveSessionList(
  range: DateRange,
  limit = 200
): Promise<SessionRow[]> {
  const rows = await db
    .select({
      id: tiktokLiveSessions.id,
      handle: tiktokAccounts.handle,
      displayName: tiktokAccounts.displayName,
      title: tiktokLiveSessions.title,
      startedAt: tiktokLiveSessions.startedAt,
      durationSeconds: tiktokLiveSessions.durationSeconds,
      peakViewers: tiktokLiveSessions.peakViewers,
      avgViewers: tiktokLiveSessions.avgViewers,
      totalViews: tiktokLiveSessions.totalViews,
      newFollowers: tiktokLiveSessions.newFollowers,
      totalLikes: tiktokLiveSessions.totalLikes,
      totalComments: tiktokLiveSessions.totalComments,
      totalShares: tiktokLiveSessions.totalShares,
      keywordLeads: tiktokLiveSessions.keywordLeads,
      uniqueViewers: tiktokLiveSessions.uniqueViewers,
      activeViewers: tiktokLiveSessions.activeViewers,
      avgWatchSeconds: tiktokLiveSessions.avgWatchSeconds,
      directMessages: tiktokLiveSessions.directMessages,
      serviceBioViews: tiktokLiveSessions.serviceBioViews,
      interestedViewers: tiktokLiveSessions.interestedViewers,
      diamonds: tiktokLiveSessions.diamonds,
    })
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .where(inRange(range))
    .orderBy(desc(at))
    .limit(limit);
  return rows as unknown as SessionRow[];
}

export type SessionDetail = {
  id: string;
  handle: string;
  displayName: string;
  title: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number;
  peakViewers: number;
  avgViewers: number;
  totalViews: number;
  newFollowers: number | null;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  keywordLeads: number;
  // Manually entered from the TikTok backend (null = not entered).
  uniqueViewers: number | null;
  activeViewers: number | null;
  avgWatchSeconds: number | null;
  directMessages: number | null;
  serviceBioViews: number | null;
  interestedViewers: number | null;
  diamonds: number | null;
};

/** The manual TikTok-backend fields, for the editor + PATCH route. */
export const MANUAL_TIKTOK_FIELDS = [
  "uniqueViewers",
  "activeViewers",
  "avgWatchSeconds",
  "directMessages",
  "serviceBioViews",
  "interestedViewers",
  "diamonds",
] as const;
export type ManualTikTokField = (typeof MANUAL_TIKTOK_FIELDS)[number];

/**
 * The connector-captured fields. A screenshot import may overwrite these with
 * TikTok's official figures (the apply-screenshot route allow-lists MANUAL ∪ AUTO).
 */
export const AUTO_TIKTOK_FIELDS = [
  "totalViews",
  "peakViewers",
  "avgViewers",
  "totalLikes",
  "totalComments",
  "totalShares",
  "newFollowers",
] as const;
export type AutoTikTokField = (typeof AUTO_TIKTOK_FIELDS)[number];

export type MatchCandidate = {
  sessionId: string;
  accountId: string;
  handle: string;
  startedAt: Date | null;
  title: string | null;
  /** Current value of every metric column (for the current → new display). */
  current: Record<string, number | null>;
};

/** Sessions (newest first) + their current metric values, for the screenshot importer. */
export async function sessionsForMatching(limit = 500): Promise<MatchCandidate[]> {
  const rows = await db
    .select({
      sessionId: tiktokLiveSessions.id,
      accountId: tiktokLiveSessions.accountId,
      handle: tiktokAccounts.handle,
      startedAt: tiktokLiveSessions.startedAt,
      title: tiktokLiveSessions.title,
      totalViews: tiktokLiveSessions.totalViews,
      peakViewers: tiktokLiveSessions.peakViewers,
      avgViewers: tiktokLiveSessions.avgViewers,
      totalLikes: tiktokLiveSessions.totalLikes,
      totalComments: tiktokLiveSessions.totalComments,
      totalShares: tiktokLiveSessions.totalShares,
      newFollowers: tiktokLiveSessions.newFollowers,
      uniqueViewers: tiktokLiveSessions.uniqueViewers,
      activeViewers: tiktokLiveSessions.activeViewers,
      avgWatchSeconds: tiktokLiveSessions.avgWatchSeconds,
      directMessages: tiktokLiveSessions.directMessages,
      serviceBioViews: tiktokLiveSessions.serviceBioViews,
      interestedViewers: tiktokLiveSessions.interestedViewers,
      diamonds: tiktokLiveSessions.diamonds,
    })
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .orderBy(desc(at))
    .limit(limit);

  return rows.map((r) => ({
    sessionId: r.sessionId,
    accountId: r.accountId,
    handle: r.handle,
    startedAt: r.startedAt,
    title: r.title,
    current: {
      totalViews: r.totalViews,
      peakViewers: r.peakViewers,
      avgViewers: r.avgViewers,
      totalLikes: r.totalLikes,
      totalComments: r.totalComments,
      totalShares: r.totalShares,
      newFollowers: r.newFollowers,
      uniqueViewers: r.uniqueViewers,
      activeViewers: r.activeViewers,
      avgWatchSeconds: r.avgWatchSeconds,
      directMessages: r.directMessages,
      serviceBioViews: r.serviceBioViews,
      interestedViewers: r.interestedViewers,
      diamonds: r.diamonds,
    },
  }));
}

export type LeadRow = {
  username: string;
  displayName: string | null;
  keyword: string;
  commentText: string | null;
  commentedAt: Date | null;
};

/** One session's header + its keyword-lead worklist (for the detail page). */
export async function sessionDetail(
  id: string
): Promise<{ session: SessionDetail | null; leads: LeadRow[] }> {
  const { tiktokLiveLeads } = await import("@/db/schema");
  const [session] = await db
    .select({
      id: tiktokLiveSessions.id,
      handle: tiktokAccounts.handle,
      displayName: tiktokAccounts.displayName,
      title: tiktokLiveSessions.title,
      startedAt: tiktokLiveSessions.startedAt,
      endedAt: tiktokLiveSessions.endedAt,
      durationSeconds: tiktokLiveSessions.durationSeconds,
      peakViewers: tiktokLiveSessions.peakViewers,
      avgViewers: tiktokLiveSessions.avgViewers,
      totalViews: tiktokLiveSessions.totalViews,
      newFollowers: tiktokLiveSessions.newFollowers,
      totalLikes: tiktokLiveSessions.totalLikes,
      totalComments: tiktokLiveSessions.totalComments,
      totalShares: tiktokLiveSessions.totalShares,
      keywordLeads: tiktokLiveSessions.keywordLeads,
      uniqueViewers: tiktokLiveSessions.uniqueViewers,
      activeViewers: tiktokLiveSessions.activeViewers,
      avgWatchSeconds: tiktokLiveSessions.avgWatchSeconds,
      directMessages: tiktokLiveSessions.directMessages,
      serviceBioViews: tiktokLiveSessions.serviceBioViews,
      interestedViewers: tiktokLiveSessions.interestedViewers,
      diamonds: tiktokLiveSessions.diamonds,
    })
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .where(eq(tiktokLiveSessions.id, id))
    .limit(1);
  if (!session) return { session: null, leads: [] };

  const leads = await db
    .select({
      username: tiktokLiveLeads.username,
      displayName: tiktokLiveLeads.displayName,
      keyword: tiktokLiveLeads.keyword,
      commentText: tiktokLiveLeads.commentText,
      commentedAt: tiktokLiveLeads.commentedAt,
    })
    .from(tiktokLiveLeads)
    .where(eq(tiktokLiveLeads.sessionId, id))
    .orderBy(desc(tiktokLiveLeads.commentedAt));

  return { session: session as unknown as SessionDetail, leads: leads as LeadRow[] };
}

export type TrendPoint = {
  date: string; // session start (YYYY-MM-DD HH:mm)
  handle: string;
  totalViewers: number;
  peakViewers: number;
  avgViewers: number;
  likes: number;
  comments: number;
  shares: number;
};

/** Per-session points, oldest → newest, for the trend charts. */
export async function tiktokLiveTrend(range: DateRange): Promise<TrendPoint[]> {
  const rows = await db
    .select({
      startedAt: at,
      handle: tiktokAccounts.handle,
      totalViewers: tiktokLiveSessions.totalViews,
      peakViewers: tiktokLiveSessions.peakViewers,
      avgViewers: tiktokLiveSessions.avgViewers,
      likes: tiktokLiveSessions.totalLikes,
      comments: tiktokLiveSessions.totalComments,
      shares: tiktokLiveSessions.totalShares,
    })
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .where(inRange(range))
    .orderBy(at);
  return rows.map((r) => {
    const d = r.startedAt ? new Date(r.startedAt as unknown as string) : null;
    const date = d
      ? `${d.toISOString().slice(0, 10)} ${String(d.getUTCHours()).padStart(2, "0")}:${String(
          d.getUTCMinutes()
        ).padStart(2, "0")}`
      : "";
    return {
      date,
      handle: r.handle,
      totalViewers: Number(r.totalViewers ?? 0),
      peakViewers: Number(r.peakViewers ?? 0),
      avgViewers: Number(r.avgViewers ?? 0),
      likes: Number(r.likes ?? 0),
      comments: Number(r.comments ?? 0),
      shares: Number(r.shares ?? 0),
    };
  });
}
