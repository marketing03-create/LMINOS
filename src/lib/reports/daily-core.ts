/**
 * One handle's daily report — the rows behind the Google Sheet link. Pure (no
 * DB), so the counting rules are pinned in tests.
 *
 * Per Malaysia-time day:
 *  - Lives, Views, Comment: added up over the day's lives.
 *  - DM: added up over the lives that have it; blank when none was entered.
 *  - Whatsapp: added up over lives WATI tracked; blank when none was (before
 *    WATI was connected, or a handle with no WhatsApp link) — never a false 0.
 *  - Total Leads, Get Documents: streamers type the DAY's total into each of
 *    the day's lives, so it is taken once (the highest entered), not added up.
 * Every day from `fromDay` to `toDay` gets a row, newest first; a day without
 * a live shows 0 lives and blanks.
 */

export type ReportLive = {
  startedAt: Date;
  views: number;
  comments: number;
  directMessages: number | null;
  /** WhatsApp leads; null = WATI didn't track this live. */
  whatsapp: number | null;
  totalLeads: number | null;
  documents: number | null;
};

export type ReportRow = {
  date: string; // YYYY-MM-DD, Malaysia time
  lives: number;
  views: number | null;
  comments: number | null;
  directMessages: number | null;
  whatsapp: number | null;
  totalLeads: number | null;
  documents: number | null;
};

const MYT_MS = 8 * 60 * 60 * 1000; // Malaysia is UTC+8, no DST
export const mytDay = (d: Date) => new Date(d.getTime() + MYT_MS).toISOString().slice(0, 10);

const sumOf = (xs: (number | null)[]) => {
  const n = xs.filter((x): x is number => x !== null);
  return n.length ? n.reduce((a, b) => a + b, 0) : null;
};
const maxOf = (xs: (number | null)[]) => {
  const n = xs.filter((x): x is number => x !== null);
  return n.length ? Math.max(...n) : null;
};

export function dailyReport(lives: ReportLive[], fromDay: string, toDay: string): ReportRow[] {
  const byDay = new Map<string, ReportLive[]>();
  for (const l of lives) {
    const d = mytDay(l.startedAt);
    byDay.set(d, [...(byDay.get(d) ?? []), l]);
  }
  const rows: ReportRow[] = [];
  for (let t = Date.parse(`${toDay}T00:00:00Z`); t >= Date.parse(`${fromDay}T00:00:00Z`); t -= 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const day = byDay.get(date) ?? [];
    rows.push({
      date,
      lives: day.length,
      views: day.length ? sumOf(day.map((l) => l.views)) : null,
      comments: day.length ? sumOf(day.map((l) => l.comments)) : null,
      directMessages: sumOf(day.map((l) => l.directMessages)),
      whatsapp: sumOf(day.map((l) => l.whatsapp)),
      totalLeads: maxOf(day.map((l) => l.totalLeads)),
      documents: maxOf(day.map((l) => l.documents)),
    });
  }
  return rows;
}

export const REPORT_HEADER = ["Date", "Lives", "Views", "Comment", "DM", "Whatsapp", "Total Leads", "Get Documents"];

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * 2026-11-05 → "05/11/2026 (Thu)". Text on purpose: Google Sheets turns a date
 * it recognises into its serial number (46331) and shows that in an
 * unformatted column, so the Sheet would need formatting by hand.
 */
export function sheetDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y} (${WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;
}

/** CSV for IMPORTDATA: header + one line per row; blanks stay empty cells. */
export function reportCsv(rows: ReportRow[]): string {
  const cell = (v: number | string | null) => (v === null ? "" : String(v));
  const lines = rows.map((r) =>
    [sheetDate(r.date), r.lives, r.views, r.comments, r.directMessages, r.whatsapp, r.totalLeads, r.documents]
      .map(cell)
      .join(",")
  );
  return [REPORT_HEADER.join(","), ...lines].join("\n") + "\n";
}
