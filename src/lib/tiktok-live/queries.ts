/**
 * Read queries for the TikTok Live dashboard: KPI rollups, the session list,
 * and a per-session trend series. Sessions are filtered by their start time
 * (falling back to created_at) within the chosen date range.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts, tiktokLiveSessions } from "@/db/schema";
import type { DateRange } from "@/lib/date-range";

const at = sql`coalesce(${tiktokLiveSessions.startedAt}, ${tiktokLiveSessions.createdAt})`;
function inRange(range: DateRange) {
  // Bind as ISO strings — the postgres driver won't serialize a raw Date param
  // inside a sql`` fragment (Postgres casts the text to timestamptz).
  return and(
    sql`${at} >= ${range.start.toISOString()}`,
    sql`${at} < ${range.end.toISOString()}`
  );
}

/**
 * Combine the date range with an optional account allow-list. Live-streamer
 * logins pass the ids of the handles assigned to them so they only ever see
 * their own sessions; admins pass `undefined` (all accounts). An empty list is
 * caught by the callers (they short-circuit to empty results).
 */
function scoped(range: DateRange, accountIds?: string[]) {
  const base = inRange(range);
  if (!accountIds) return base;
  return and(base, inArray(tiktokLiveSessions.accountId, accountIds));
}

/** The TikTok handle ids assigned to a live-streamer user (Feature U). */
export async function streamerAccountIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: tiktokAccounts.id })
    .from(tiktokAccounts)
    .where(eq(tiktokAccounts.assignedStreamerId, userId));
  return rows.map((r) => r.id);
}

/**
 * Handles the current user may add a PAST live to — a streamer's own handles
 * (pass their account ids) or, for an admin, all handles (pass undefined).
 */
export async function tiktokAccountsForPicker(
  accountIds?: string[]
): Promise<{ id: string; handle: string }[]> {
  if (accountIds && accountIds.length === 0) return [];
  return db
    .select({ id: tiktokAccounts.id, handle: tiktokAccounts.handle })
    .from(tiktokAccounts)
    .where(accountIds ? inArray(tiktokAccounts.id, accountIds) : undefined)
    .orderBy(tiktokAccounts.handle);
}

/**
 * Every handle plus whether it has lead keywords configured.
 *
 * The Overview needs the keyword flag because `keyword_leads` is NOT NULL
 * DEFAULT 0: a handle with no keywords set records a confident 0 on every live,
 * which reads as "this streamer converts nobody" when it only means nobody
 * configured the words to watch for.
 */
export async function tiktokAccountsWithKeywords(): Promise<
  { id: string; handle: string; hasKeywords: boolean }[]
> {
  const rows = await db
    .select({
      id: tiktokAccounts.id,
      handle: tiktokAccounts.handle,
      leadKeywords: tiktokAccounts.leadKeywords,
    })
    .from(tiktokAccounts)
    .orderBy(tiktokAccounts.handle);
  return rows.map((r) => ({
    id: r.id,
    handle: r.handle,
    hasKeywords: (r.leadKeywords?.length ?? 0) > 0,
  }));
}

/** True if `sessionId` belongs to a handle assigned to this streamer. */
export async function streamerOwnsSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: tiktokLiveSessions.id })
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .where(
      and(
        eq(tiktokLiveSessions.id, sessionId),
        eq(tiktokAccounts.assignedStreamerId, userId)
      )
    )
    .limit(1);
  return !!row;
}

export type TikTokAccountHeader = {
  id: string;
  handle: string;
  displayName: string;
  isActive: boolean;
  leadKeywords: string[] | null;
  lastSyncedAt: Date | null;
  streamerEmail: string | null;
  streamerName: string | null;
};

/** One handle's header details (for the streamer detail page). Null if unknown. */
export async function tiktokAccountHeader(
  id: string
): Promise<TikTokAccountHeader | null> {
  const { users } = await import("@/db/schema");
  const [row] = await db
    .select({
      id: tiktokAccounts.id,
      handle: tiktokAccounts.handle,
      displayName: tiktokAccounts.displayName,
      isActive: tiktokAccounts.isActive,
      leadKeywords: tiktokAccounts.leadKeywords,
      lastSyncedAt: tiktokAccounts.lastSyncedAt,
      streamerEmail: users.email,
      streamerName: users.fullName,
    })
    .from(tiktokAccounts)
    .leftJoin(users, eq(users.id, tiktokAccounts.assignedStreamerId))
    .where(eq(tiktokAccounts.id, id))
    .limit(1);
  return (row as unknown as TikTokAccountHeader) ?? null;
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
  totalLeads: number;
};

export async function tiktokLiveKpis(
  range: DateRange,
  accountIds?: string[]
): Promise<TikTokKpis> {
  if (accountIds && accountIds.length === 0) {
    return {
      sessions: 0,
      liveHours: 0,
      avgPeakViewers: 0,
      totalViews: 0,
      newFollowers: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      leads: 0,
      totalLeads: 0,
    };
  }
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
      totalLeads: sql<number>`coalesce(sum(coalesce(${tiktokLiveSessions.totalLeads},0)),0)::int`,
    })
    .from(tiktokLiveSessions)
    .where(scoped(range, accountIds));
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
    totalLeads: Number(r?.totalLeads ?? 0),
  };
}

export type SessionRow = {
  id: string;
  accountId: string;
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
  // Streamer-tagged loan product(s)/service(s) for this live (null/[] = untagged).
  products: string[] | null;
  // Manually entered from the TikTok backend (null = not entered yet).
  uniqueViewers: number | null;
  activeViewers: number | null;
  avgWatchSeconds: number | null;
  directMessages: number | null;
  serviceBioViews: number | null;
  interestedViewers: number | null;
  diamonds: number | null;
  totalLeads: number | null;
  filteredLeads: number | null;
  // Free-text note the streamer/admin added for this live (null = none).
  remarks: string | null;
};

export async function tiktokLiveSessionList(
  range: DateRange,
  limit = 200,
  accountIds?: string[]
): Promise<SessionRow[]> {
  if (accountIds && accountIds.length === 0) return [];
  const rows = await db
    .select({
      id: tiktokLiveSessions.id,
      accountId: tiktokLiveSessions.accountId,
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
      products: tiktokLiveSessions.products,
      uniqueViewers: tiktokLiveSessions.uniqueViewers,
      activeViewers: tiktokLiveSessions.activeViewers,
      avgWatchSeconds: tiktokLiveSessions.avgWatchSeconds,
      directMessages: tiktokLiveSessions.directMessages,
      serviceBioViews: tiktokLiveSessions.serviceBioViews,
      interestedViewers: tiktokLiveSessions.interestedViewers,
      diamonds: tiktokLiveSessions.diamonds,
      totalLeads: tiktokLiveSessions.totalLeads,
      filteredLeads: tiktokLiveSessions.filteredLeads,
      remarks: tiktokLiveSessions.remarks,
    })
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .where(scoped(range, accountIds))
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
  // Streamer-tagged loan product(s)/service(s) for this live (null/[] = untagged).
  products: string[] | null;
  // Manually entered from the TikTok backend (null = not entered).
  uniqueViewers: number | null;
  activeViewers: number | null;
  avgWatchSeconds: number | null;
  directMessages: number | null;
  serviceBioViews: number | null;
  interestedViewers: number | null;
  diamonds: number | null;
  totalLeads: number | null;
  filteredLeads: number | null;
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
  "totalLeads",
  "filteredLeads",
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
  /** Product(s)/service(s) tagged on the live (pre-fills the importer picker). */
  products: string[] | null;
  /** Current value of every metric column (for the current → new display). */
  current: Record<string, number | null>;
  /** Free-text note already saved on the live (pre-fills the Remarks box). */
  remarks: string | null;
};

/** Sessions (newest first) + their current metric values, for the screenshot importer. */
export async function sessionsForMatching(
  limit = 500,
  accountIds?: string[]
): Promise<MatchCandidate[]> {
  if (accountIds && accountIds.length === 0) return [];
  const rows = await db
    .select({
      sessionId: tiktokLiveSessions.id,
      accountId: tiktokLiveSessions.accountId,
      handle: tiktokAccounts.handle,
      startedAt: tiktokLiveSessions.startedAt,
      title: tiktokLiveSessions.title,
      products: tiktokLiveSessions.products,
      keywordLeads: tiktokLiveSessions.keywordLeads,
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
      totalLeads: tiktokLiveSessions.totalLeads,
      filteredLeads: tiktokLiveSessions.filteredLeads,
      remarks: tiktokLiveSessions.remarks,
    })
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .where(accountIds ? inArray(tiktokLiveSessions.accountId, accountIds) : undefined)
    .orderBy(desc(at))
    .limit(limit);

  return rows.map((r) => ({
    sessionId: r.sessionId,
    accountId: r.accountId,
    handle: r.handle,
    startedAt: r.startedAt,
    title: r.title,
    products: r.products,
    current: {
      keywordLeads: r.keywordLeads,
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
      totalLeads: r.totalLeads,
      filteredLeads: r.filteredLeads,
    },
    remarks: r.remarks,
  }));
}

export type LeadRow = {
  username: string;
  displayName: string | null;
  keyword: string;
  commentText: string | null;
  commentedAt: Date | null;
};

/**
 * One session's header + its keyword-lead worklist (for the detail page).
 * `accountIds` scopes a live-streamer to their own handles: a session that
 * isn't theirs resolves to null (the page then 404s).
 */
export async function sessionDetail(
  id: string,
  accountIds?: string[]
): Promise<{ session: SessionDetail | null; leads: LeadRow[] }> {
  if (accountIds && accountIds.length === 0) return { session: null, leads: [] };
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
      products: tiktokLiveSessions.products,
      uniqueViewers: tiktokLiveSessions.uniqueViewers,
      activeViewers: tiktokLiveSessions.activeViewers,
      avgWatchSeconds: tiktokLiveSessions.avgWatchSeconds,
      directMessages: tiktokLiveSessions.directMessages,
      serviceBioViews: tiktokLiveSessions.serviceBioViews,
      interestedViewers: tiktokLiveSessions.interestedViewers,
      diamonds: tiktokLiveSessions.diamonds,
      totalLeads: tiktokLiveSessions.totalLeads,
      filteredLeads: tiktokLiveSessions.filteredLeads,
    })
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .where(
      accountIds
        ? and(
            eq(tiktokLiveSessions.id, id),
            inArray(tiktokLiveSessions.accountId, accountIds)
          )
        : eq(tiktokLiveSessions.id, id)
    )
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

export type MismatchAlert = {
  auditId: string;
  sessionId: string;
  handle: string;
  startedAt: Date | null;
  streamerEmail: string | null;
  at: Date;
  mismatches: { field: string; screenshot: number; entered: number | null }[];
};

/**
 * Recent cases where a LIVE STREAMER saved metrics that differ from what their
 * uploaded screenshot showed (recorded as `screenshot_mismatch` audit events by
 * the apply-screenshot route). For the admin-only alert on Admin → TikTok Live.
 */
export async function recentScreenshotMismatches(days = 7): Promise<MismatchAlert[]> {
  const { auditLogs, users } = await import("@/db/schema");
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      auditId: auditLogs.id,
      sessionId: tiktokLiveSessions.id,
      handle: tiktokAccounts.handle,
      startedAt: tiktokLiveSessions.startedAt,
      streamerEmail: users.email,
      after: auditLogs.after,
      at: auditLogs.createdAt,
    })
    .from(auditLogs)
    // entity_id is text; the session id is a uuid — compare as text (safe for any
    // audit row, so non-session events simply don't join).
    .innerJoin(
      tiktokLiveSessions,
      sql`${auditLogs.entityId} = ${tiktokLiveSessions.id}::text`
    )
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(
      and(
        eq(auditLogs.eventType, "tiktok_live_session.screenshot_mismatch"),
        sql`${auditLogs.createdAt} >= ${since.toISOString()}`
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);
  return rows.map((r) => ({
    auditId: r.auditId,
    sessionId: r.sessionId,
    handle: r.handle,
    startedAt: r.startedAt,
    streamerEmail: r.streamerEmail,
    at: r.at as unknown as Date,
    mismatches:
      (r.after as { mismatches?: MismatchAlert["mismatches"] } | null)?.mismatches ?? [],
  }));
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
export async function tiktokLiveTrend(
  range: DateRange,
  accountIds?: string[]
): Promise<TrendPoint[]> {
  if (accountIds && accountIds.length === 0) return [];
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
    .where(scoped(range, accountIds))
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
