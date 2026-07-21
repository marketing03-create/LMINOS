/**
 * When is a live "fully filled in"? ONE definition, shared by the 10am reminder
 * cron and the Notification Center's auto-clear check, so the two can never
 * disagree about whether a streamer still owes numbers.
 *
 * A live counts as COMPLETE only when all four streamer-entered metrics are
 * present. Note a legitimate zero must be entered as `0` — leaving the field
 * blank keeps the live flagged.
 */
import { and, gte, isNull, lt, or, type SQL } from "drizzle-orm";
import { tiktokLiveSessions } from "@/db/schema";

/** The metrics a streamer must key in before a live is considered done. */
export const REQUIRED_METRICS = [
  "totalLeads",
  "filteredLeads",
  "directMessages",
  "serviceBioViews",
] as const;
export type RequiredMetric = (typeof REQUIRED_METRICS)[number];

/** Human labels, for "missing DMs, Bio views" style summaries. */
export const METRIC_LABEL: Record<RequiredMetric, string> = {
  totalLeads: "Total Leads",
  filteredLeads: "Filtered Leads",
  directMessages: "DMs",
  serviceBioViews: "Bio views",
};

/** Ignore accidental taps / quick tests — they need no results. */
export const MIN_DURATION_SECONDS = 300; // 5 minutes
/** Don't nag about ancient lives forever. */
export const LOOKBACK_DAYS = 14;

/** Drizzle condition: at least one required metric is still NULL. */
export function incompleteCondition(): SQL {
  return or(
    isNull(tiktokLiveSessions.totalLeads),
    isNull(tiktokLiveSessions.filteredLeads),
    isNull(tiktokLiveSessions.directMessages),
    isNull(tiktokLiveSessions.serviceBioViews)
  ) as SQL;
}

/** The full "this live still owes numbers" filter, incl. the duration floor. */
export function outstandingCondition(since: Date, until: Date): SQL {
  return and(
    gte(tiktokLiveSessions.startedAt, since),
    lt(tiktokLiveSessions.startedAt, until),
    gte(tiktokLiveSessions.durationSeconds, MIN_DURATION_SECONDS),
    incompleteCondition()
  ) as SQL;
}

/** Which required metrics are still blank on a row (for the summary text). */
export function missingMetrics(row: {
  totalLeads: number | null;
  filteredLeads: number | null;
  directMessages: number | null;
  serviceBioViews: number | null;
}): RequiredMetric[] {
  return REQUIRED_METRICS.filter((m) => row[m] == null);
}

/** True when every required metric is filled in. */
export function isComplete(row: Parameters<typeof missingMetrics>[0]): boolean {
  return missingMetrics(row).length === 0;
}

/** The rolling window the reminder looks back over, ending "now". */
export function lookbackWindow(now = new Date()): { since: Date; until: Date } {
  return {
    since: new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000),
    until: now,
  };
}
