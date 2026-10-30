/**
 * When is a live "fully filled in"? ONE definition, shared by every reminder job
 * and the Notification Center's auto-clear, so they can never disagree about
 * whether a streamer still owes numbers.
 *
 * The metrics split into TWO groups, because they're owned by different people
 * and chased on different clocks:
 *
 *   LIVE_METRICS  (the streamer keys these from the TikTok backend) — nudged
 *                 ~1 hour after the live ends, and again at 10pm if still blank.
 *   LEAD_METRICS  (Customer Service keys these as leads come in) — chased on the
 *                 existing 10am morning check, since leads arrive over hours/days.
 *
 * A legitimate zero must be entered as `0`; a blank keeps the live flagged.
 *
 * Total PM (`totalLeads`) is ADMIN-ONLY: a streamer never sees it, so nothing a
 * streamer is shown — their reminders, badges, "Missing:" lines, the admin's
 * nudge to them — may count it. Those use the STREAMER_* sets below; admin
 * views keep the full REQUIRED_METRICS.
 */
import { and, gte, isNull, lt, or, type SQL } from "drizzle-orm";
import { tiktokLiveSessions } from "@/db/schema";

/** Streamer-owned — chased ~1h after a live and again at 10pm. */
export const LIVE_METRICS = ["directMessages", "serviceBioViews"] as const;
/** Customer-Service-owned — chased on the 10am morning check. */
export const LEAD_METRICS = ["totalLeads", "filteredLeads"] as const;

/** Everything a live needs before it's considered done (the admin view). */
export const REQUIRED_METRICS = [...LEAD_METRICS, ...LIVE_METRICS] as const;
export type RequiredMetric = (typeof REQUIRED_METRICS)[number];

/** The lead metric a streamer may see and is chased for — not Total PM. */
export const STREAMER_LEAD_METRICS = ["filteredLeads"] as const;
/** Everything a streamer is asked to fill in. */
export const STREAMER_METRICS = [...STREAMER_LEAD_METRICS, ...LIVE_METRICS] as const;

/**
 * Fields only admins may read or write. Total PM (`totalLeads`) is admin-only:
 * a streamer's screens never show it, and every write route refuses it from a
 * streamer — even a hand-built request — via `streamerSentAdminOnly`.
 */
export const ADMIN_ONLY_TIKTOK_FIELDS = ["totalLeads"] as const;

/** True when a streamer's request body tries to set an admin-only field. */
export function streamerSentAdminOnly(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  return ADMIN_ONLY_TIKTOK_FIELDS.some((f) => f in (obj as Record<string, unknown>));
}

export const ADMIN_ONLY_MESSAGE = "Total PM can only be entered by an admin.";

/** Human labels, for "missing DMs, Bio views" style summaries. */
export const METRIC_LABEL: Record<RequiredMetric, string> = {
  totalLeads: "Total PM",
  filteredLeads: "Document Collect",
  directMessages: "DMs",
  serviceBioViews: "Bio views",
};

/** Ignore accidental taps / quick tests — they need no results. */
export const MIN_DURATION_SECONDS = 300; // 5 minutes
/** Don't nag about ancient lives forever. */
export const LOOKBACK_DAYS = 14;

type MetricRow = {
  totalLeads: number | null;
  filteredLeads: number | null;
  directMessages: number | null;
  serviceBioViews: number | null;
};

// ── Per-group SQL conditions (any listed metric still NULL) ──

/** Any of the four required metrics is still NULL. */
export function incompleteCondition(): SQL {
  return or(
    isNull(tiktokLiveSessions.totalLeads),
    isNull(tiktokLiveSessions.filteredLeads),
    isNull(tiktokLiveSessions.directMessages),
    isNull(tiktokLiveSessions.serviceBioViews)
  ) as SQL;
}

/** A streamer live-metric (DMs or Bio views) is still NULL. */
export function liveMetricsIncompleteCondition(): SQL {
  return or(
    isNull(tiktokLiveSessions.directMessages),
    isNull(tiktokLiveSessions.serviceBioViews)
  ) as SQL;
}

/** Everything a streamer owes (Document Collect, DMs, Bio views) — no Total PM. */
export function streamerIncompleteCondition(): SQL {
  return or(
    isNull(tiktokLiveSessions.filteredLeads),
    isNull(tiktokLiveSessions.directMessages),
    isNull(tiktokLiveSessions.serviceBioViews)
  ) as SQL;
}

/** The streamer's lead metric (Document Collect) is still NULL. */
export function streamerLeadMetricsIncompleteCondition(): SQL {
  return isNull(tiktokLiveSessions.filteredLeads) as SQL;
}

/** A lead metric (Total PM or Document Collect) is still NULL. */
export function leadMetricsIncompleteCondition(): SQL {
  return or(
    isNull(tiktokLiveSessions.totalLeads),
    isNull(tiktokLiveSessions.filteredLeads)
  ) as SQL;
}

/**
 * The full "this live still owes numbers" filter for a chosen metric group,
 * including the duration floor and the started-at window. Defaults to all four.
 */
export function outstandingCondition(
  since: Date,
  until: Date,
  cond: SQL = incompleteCondition()
): SQL {
  return and(
    gte(tiktokLiveSessions.startedAt, since),
    lt(tiktokLiveSessions.startedAt, until),
    gte(tiktokLiveSessions.durationSeconds, MIN_DURATION_SECONDS),
    cond
  ) as SQL;
}

// ── Which metrics are still blank on a row (for the summary text) ──

function missingFrom(row: MetricRow, metrics: readonly RequiredMetric[]) {
  return metrics.filter((m) => row[m] == null);
}
/** All required metrics still blank on a row. */
export const missingMetrics = (row: MetricRow) => missingFrom(row, REQUIRED_METRICS);
/** Streamer live-metrics still blank. */
export const missingLiveMetrics = (row: MetricRow) => missingFrom(row, LIVE_METRICS);
/** Lead metrics still blank. */
export const missingLeadMetrics = (row: MetricRow) => missingFrom(row, LEAD_METRICS);
/** What a streamer still owes — never Total PM, which they can't see. */
export const missingStreamerMetrics = (row: Omit<MetricRow, "totalLeads">) =>
  STREAMER_METRICS.filter((m) => row[m] == null);
/** The streamer's lead metric still blank (Document Collect). */
export const missingStreamerLeadMetrics = (row: Omit<MetricRow, "totalLeads">) =>
  STREAMER_LEAD_METRICS.filter((m) => row[m] == null);

/** True when every required metric is filled in. */
export function isComplete(row: MetricRow): boolean {
  return missingMetrics(row).length === 0;
}

/** The rolling window a reminder looks back over, ending "now". */
export function lookbackWindow(now = new Date()): { since: Date; until: Date } {
  return {
    since: new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000),
    until: now,
  };
}
