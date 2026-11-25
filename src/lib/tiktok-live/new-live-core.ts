/**
 * A screenshot of a live that isn't in TT Stars yet (a new streamer's first
 * live, or one the tracker missed) becomes a NEW live from the screenshot
 * importer. Pure helpers, so the defaults are pinned in tests.
 */

export type NewLive = {
  accountId: string;
  /** YYYY-MM-DD, Malaysia time. */
  date: string;
  /** HH:MM, Malaysia time. */
  startTime: string;
};

const norm = (h: string) => h.trim().replace(/^@/, "").toLowerCase();

/**
 * Starting values for a new live from what the screenshot read: the handle the
 * screenshot names (or the person's only handle), its date and start time.
 * Anything unknown stays "" for the person to fill.
 */
export function newLiveDefaults(
  group: { handle: string | null; date: string | null; startTime: string | null },
  accounts: { id: string; handle: string }[]
): NewLive {
  const byHandle = group.handle ? accounts.find((a) => norm(a.handle) === norm(group.handle!)) : undefined;
  return {
    accountId: byHandle?.id ?? (accounts.length === 1 ? accounts[0].id : ""),
    date: group.date && /^\d{4}-\d{2}-\d{2}$/.test(group.date) ? group.date : "",
    startTime: group.startTime && /^\d{2}:\d{2}$/.test(group.startTime) ? group.startTime : "",
  };
}

/** What's still missing before the live can be created; null = ready. */
export function newLiveProblem(n: NewLive): string | null {
  if (!n.accountId) return "Pick the handle for this live.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date)) return "Enter the date of the live.";
  if (!/^\d{2}:\d{2}$/.test(n.startTime)) return "Enter the start time of the live.";
  return null;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-06-25" → "25 Jun" */
export function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTH.at(Number(iso.slice(5, 7)) - 1) ?? ""}`.trim();
}

/**
 * A plain warning for a live whose date is far from today — older than a week
 * (it won't be on Home's default 7 days) or in the future — e.g.
 * "25 Jun · 5 months ago". Null when the date is recent or unknown.
 */
export function liveDateNote(date: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return `${shortDate(date)} · in the future`;
  if (days <= 7) return null;
  const ago = days < 60 ? `${days} days ago` : `${Math.round(days / 30)} months ago`;
  return `${shortDate(date)} · ${ago}`;
}
