/**
 * Live Analysis (pure, DB-free): the admin data-analysis section — three summary
 * cards plus four charts, every chart re-aggregatable (SUM / AVG / MIN / MAX /
 * COUNT / MEDIAN) from the same per-live rows.
 *
 * All clock maths is Malaysia time (UTC+8, no DST). A bucket's value is computed
 * only from lives that actually have that metric recorded, so a blank field
 * never drags an average down to zero.
 */

export type Agg = "SUM" | "AVG" | "MIN" | "MAX" | "COUNT" | "MEDIAN";

export const AGGREGATIONS: readonly Agg[] = [
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "COUNT",
  "MEDIAN",
] as const;

export const AGG_LABEL: Record<Agg, string> = {
  SUM: "Total",
  AVG: "Average",
  MIN: "Minimum",
  MAX: "Maximum",
  COUNT: "Count of lives",
  MEDIAN: "Median",
};

/** The slim per-live shape the cards + charts need (safe to pass to the client). */
export type AnalysisSession = {
  startedAt: string | null; // ISO
  durationSeconds: number | null;
  totalViews: number | null;
  peakViewers: number | null;
  avgWatchSeconds: number | null;
  directMessages: number | null;
  products: string[] | null;
  totalLeads: number | null;
  filteredLeads: number | null;
};

const MYT_OFFSET_MS = 8 * 3_600_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

function myt(iso: string): Date {
  return new Date(new Date(iso).getTime() + MYT_OFFSET_MS);
}
/** YYYY-MM-DD in Malaysia time. */
export function mytDate(iso: string): string {
  return myt(iso).toISOString().slice(0, 10);
}
/** 0–23 in Malaysia time. */
export function mytHour(iso: string): number {
  return myt(iso).getUTCHours();
}
export function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

/**
 * Collapse a bucket's values with the chosen aggregation.
 * COUNT = how many lives contributed a value (so it works even when empty).
 * Everything else returns null for an empty bucket — the chart shows a gap
 * rather than a misleading zero.
 */
export function aggregate(values: number[], agg: Agg): number | null {
  if (agg === "COUNT") return values.length;
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  switch (agg) {
    case "SUM":
      return round1(sum);
    case "AVG":
      return round1(sum / values.length);
    case "MIN":
      return round1(values.reduce((a, b) => (b < a ? b : a), values[0]));
    case "MAX":
      return round1(values.reduce((a, b) => (b > a ? b : a), values[0]));
    case "MEDIAN": {
      const s = [...values].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return round1(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
    }
  }
}

export type Bucket = { label: string; sort: number };
export type SeriesDef = {
  key: string;
  name: string;
  get: (s: AnalysisSession) => number | null;
};
/** One point/bar: its label, how many lives it covers, and a value per series. */
export type ChartRow = { label: string; n: number } & Record<
  string,
  string | number | null
>;

/**
 * Generic bucket-and-aggregate. `bucketsOf` may place one live in several
 * buckets (a live tagged with two products counts toward both).
 */
export function buildChart(
  sessions: AnalysisSession[],
  bucketsOf: (s: AnalysisSession) => Bucket[] | null,
  series: SeriesDef[],
  agg: Agg
): ChartRow[] {
  const m = new Map<
    string,
    { sort: number; n: number; vals: Map<string, number[]> }
  >();

  for (const s of sessions) {
    const buckets = bucketsOf(s);
    if (!buckets || buckets.length === 0) continue;
    for (const b of buckets) {
      const g =
        m.get(b.label) ?? { sort: b.sort, n: 0, vals: new Map<string, number[]>() };
      g.n += 1;
      for (const def of series) {
        const v = def.get(s);
        if (v == null || !Number.isFinite(v)) continue;
        const arr = g.vals.get(def.key) ?? [];
        arr.push(v);
        g.vals.set(def.key, arr);
      }
      m.set(b.label, g);
    }
  }

  return [...m.entries()]
    .sort((a, b) => a[1].sort - b[1].sort)
    .map(([label, g]) => {
      const row: ChartRow = { label, n: g.n };
      for (const def of series) {
        row[def.key] = aggregate(g.vals.get(def.key) ?? [], agg);
      }
      return row;
    });
}

// ── Bucket functions ──
const byDate = (s: AnalysisSession): Bucket[] | null =>
  s.startedAt
    ? [{ label: mytDate(s.startedAt), sort: new Date(s.startedAt).getTime() }]
    : null;

const byHour = (s: AnalysisSession): Bucket[] | null => {
  if (!s.startedAt) return null;
  const h = mytHour(s.startedAt);
  return [{ label: hourLabel(h), sort: h }];
};

const byProduct = (s: AnalysisSession): Bucket[] | null => {
  const tags = (s.products ?? []).map((p) => p.trim()).filter(Boolean);
  if (tags.length === 0) return [{ label: "Untagged", sort: 9_999 }];
  return tags.map((t) => ({ label: t, sort: 0 }));
};

// ── Series ──
const DURATION: SeriesDef = {
  key: "duration",
  name: "Live duration (min)",
  get: (s) => (s.durationSeconds == null ? null : s.durationSeconds / 60),
};
const VIEWS: SeriesDef = { key: "views", name: "Views", get: (s) => s.totalViews };
const WATCH: SeriesDef = {
  key: "watch",
  name: "Avg watch (sec)",
  get: (s) => s.avgWatchSeconds,
};
const DMS: SeriesDef = {
  key: "dms",
  name: "Direct messages",
  get: (s) => s.directMessages,
};
const LEAD_SERIES: SeriesDef[] = [
  { key: "totalLeads", name: "Total Leads", get: (s) => s.totalLeads },
  { key: "filteredLeads", name: "Filtered Leads", get: (s) => s.filteredLeads },
];

// ── The four charts ──

/** Line: live duration per calendar day. */
export function durationByDate(s: AnalysisSession[], agg: Agg): ChartRow[] {
  return buildChart(s, byDate, [DURATION], agg);
}

/** Line: views by hour of day — which slot actually reaches people. */
export function viewsByHour(s: AnalysisSession[], agg: Agg): ChartRow[] {
  return buildChart(s, byHour, [VIEWS], agg);
}

/** Line: reach per live over time (one point per calendar day). */
export function viewsByDate(s: AnalysisSession[], agg: Agg): ChartRow[] {
  return buildChart(s, byDate, [VIEWS], agg);
}

/** Line: how long viewers stayed, day by day. */
export function watchByDate(s: AnalysisSession[], agg: Agg): ChartRow[] {
  return buildChart(s, byDate, [WATCH], agg);
}

/** Line: direct messages received, day by day. */
export function dmsByDate(s: AnalysisSession[], agg: Agg): ChartRow[] {
  return buildChart(s, byDate, [DMS], agg);
}

/** Bar: leads per product. */
export function leadsByProduct(s: AnalysisSession[], agg: Agg): ChartRow[] {
  const rows = buildChart(s, byProduct, LEAD_SERIES, agg);
  // Busiest product first; "Untagged" always last.
  return rows.sort((a, b) =>
    a.label === "Untagged" ? 1 : b.label === "Untagged" ? -1 : b.n - a.n
  );
}

/** Bar: leads by hour of day — which slot actually converts. */
export function leadsByHour(s: AnalysisSession[], agg: Agg): ChartRow[] {
  return buildChart(s, byHour, LEAD_SERIES, agg);
}

// ── Summary cards ──
export type Summary = {
  sessions: number;
  totalLeads: number;
  filteredLeads: number;
  /** Filtered ÷ Total, as a percentage. Null when there are no leads yet. */
  qualityRate: number | null;
  totalViews: number;
  avgPeakViewers: number | null;
  liveHours: number;
  livesWithLeads: number;
};

/**
 * Every headline card, computed from the SAME (date-filtered) rows the charts
 * use — so a card can never disagree with the chart beneath it.
 */
export function summaryCards(sessions: AnalysisSession[]): Summary {
  let totalLeads = 0;
  let filteredLeads = 0;
  let livesWithLeads = 0;
  let totalViews = 0;
  let durationSec = 0;
  const peaks: number[] = [];

  for (const s of sessions) {
    if (s.totalLeads != null) {
      totalLeads += s.totalLeads;
      livesWithLeads += 1;
    }
    if (s.filteredLeads != null) filteredLeads += s.filteredLeads;
    if (s.totalViews != null) totalViews += s.totalViews;
    if (s.durationSeconds != null) durationSec += s.durationSeconds;
    if (s.peakViewers != null) peaks.push(s.peakViewers);
  }

  return {
    sessions: sessions.length,
    totalLeads,
    filteredLeads,
    qualityRate: totalLeads > 0 ? round1((filteredLeads / totalLeads) * 100) : null,
    totalViews,
    avgPeakViewers:
      peaks.length > 0
        ? Math.round(peaks.reduce((a, b) => a + b, 0) / peaks.length)
        : null,
    liveHours: round1(durationSec / 3600),
    livesWithLeads,
  };
}
