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
 *  - Remarks: each live's remarks, in the order the lives ran, joined with
 *    " | " (the same text twice shows once). Phone-like numbers are masked —
 *    the Sheet link is public to anyone holding it.
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
  /** The live's free-text remarks; null/blank = none. */
  remarks?: string | null;
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
  remarks: string | null;
};

const MYT_MS = 8 * 60 * 60 * 1000; // Malaysia is UTC+8, no DST
export const mytDay = (d: Date) => new Date(d.getTime() + MYT_MS).toISOString().slice(0, 10);

const sumOf = (xs: (number | null)[]) => {
  const n = xs.filter((x): x is number => x !== null);
  return n.length ? n.reduce((a, b) => a + b, 0) : null;
};
/** Remarks for a public sheet: one line, phone-like numbers masked to their last 4 digits. */
export function cleanRemark(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\+?\d[\d\s-]{6,}\d/g, (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 8 ? `…${digits.slice(-4)}` : m;
    })
    .trim();
}

const remarksOf = (xs: (string | null | undefined)[]) => {
  const seen = new Set<string>();
  for (const x of xs) {
    const t = x ? cleanRemark(x) : "";
    if (t) seen.add(t);
  }
  return seen.size ? [...seen].join(" | ") : null;
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
      remarks: remarksOf([...day].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()).map((l) => l.remarks)),
    });
  }
  return rows;
}

export const REPORT_HEADER = [
  "Date",
  "Day",
  "Lives",
  "Views",
  "Comment",
  "DM",
  "Whatsapp",
  "Total Leads",
  "Get Documents",
  "Document (%)",
  "Remarks",
];

/**
 * The formula for cell A1. IMPORTDATA alone shows dates as serial numbers
 * (46331) and percentages as fractions (0.667), so it's wrapped in QUERY whose
 * `format` clause displays them as 05/11/2026 and 66.7% — nothing to format by
 * hand. Column numbers come from REPORT_HEADER, so they follow the columns.
 */
export function sheetFormula(url: string): string {
  const col = (name: string) => `Col${REPORT_HEADER.indexOf(name) + 1}`;
  return `=QUERY(IMPORTDATA("${url}"),"select * format ${col("Date")} 'dd/MM/yyyy', ${col("Document (%)")} '0.0%'",1)`;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 2026-11-05 → "Thu". */
export function weekday(iso: string): string {
  return WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

/** Get Documents ÷ Total Leads as "58.1%"; null when either is missing or leads are 0. */
export function documentRate(documents: number | null, totalLeads: number | null): string | null {
  if (documents === null || totalLeads === null || totalLeads === 0) return null;
  return `${Math.round((documents / totalLeads) * 1000) / 10}%`;
}

/**
 * CSV for IMPORTDATA: header + one line per row; blanks stay empty cells. The
 * date goes out as YYYY-MM-DD so Google reads day and month the right way round
 * whatever the Sheet's locale; it becomes a real date (format column A as Date
 * once and it shows as 05/11/2026).
 */
export function reportCsv(rows: ReportRow[]): string {
  // Quoted when it holds a comma or a quote (remarks), quotes doubled.
  const cell = (v: number | string | null) => {
    if (v === null) return "";
    const t = String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = rows.map((r) =>
    [
      r.date,
      weekday(r.date),
      r.lives,
      r.views,
      r.comments,
      r.directMessages,
      r.whatsapp,
      r.totalLeads,
      r.documents,
      documentRate(r.documents, r.totalLeads),
      r.remarks,
    ]
      .map(cell)
      .join(",")
  );
  return [REPORT_HEADER.join(","), ...lines].join("\n") + "\n";
}
