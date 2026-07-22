/**
 * Live Analysis (pure, DB-free): the admin data-analysis section — three summary
 * cards plus four charts, every chart re-aggregatable (SUM / AVG / MIN / MAX /
 * COUNT / MEDIAN) from the same per-live rows.
 *
 * All clock maths is Malaysia time (UTC+8, no DST). A bucket's value is computed
 * only from lives that actually have that metric recorded, so a blank field
 * never drags an average down to zero.
 */

import { filterTikTokProducts } from "./products";

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
  // "with a value" matters: aggregate() counts only lives that RECORDED the
  // metric, which on a 19%-filled field is far fewer than the lives in the bucket.
  COUNT: "Count of lives with a value",
  MEDIAN: "Median",
};

/** The slim per-live shape the cards + charts need (safe to pass to the client). */
export type AnalysisSession = {
  /** Session id + owning handle — the Overview links rows and groups by streamer. */
  id: string;
  accountId: string;
  handle: string;
  startedAt: string | null; // ISO
  durationSeconds: number | null;
  totalViews: number | null;
  peakViewers: number | null;
  avgViewers: number | null;
  avgWatchSeconds: number | null;
  directMessages: number | null;
  serviceBioViews: number | null;
  uniqueViewers: number | null;
  newFollowers: number | null;
  totalLikes: number | null;
  totalComments: number | null;
  keywordLeads: number | null;
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
/**
 * One point/bar: its label, how many lives it covers, and a value per series.
 * Also carries `<key>_n` per series — how many lives actually CONTRIBUTED a value
 * to that series. `n` counts every live in the bucket whether or not it had the
 * metric recorded, so on a 19%-filled field the two differ wildly; a tooltip that
 * shows `n` beside a value built from `<key>_n` lives overstates its own evidence.
 */
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
        const vals = g.vals.get(def.key) ?? [];
        row[def.key] = aggregate(vals, agg);
        row[`${def.key}_n`] = vals.length;
      }
      return row;
    });
}

// ── Bucket functions ──
export const byDate = (s: AnalysisSession): Bucket[] | null =>
  s.startedAt
    ? [{ label: mytDate(s.startedAt), sort: new Date(s.startedAt).getTime() }]
    : null;

export const byHour = (s: AnalysisSession): Bucket[] | null => {
  if (!s.startedAt) return null;
  const h = mytHour(s.startedAt);
  return [{ label: hourLabel(h), sort: h }];
};

/**
 * ONE bucket per live, labelled with its whole product COMBINATION.
 *
 * This used to return a bucket per tag, and `buildChart` credits a session to
 * every bucket it lands in — so a live tagged "KK" + "Koperasi" had its leads
 * counted under BOTH bars and the chart totalled to twice the real figure. Every
 * tagged live here carries exactly that pair, so the shipped chart double-booked
 * all of them. Bucketing by combination makes each live count once, which is what
 * makes SUM legitimate and the bars add up to the period total.
 *
 * `filterTikTokProducts` returns the canonical TIKTOK_PRODUCTS order, so
 * "KK + Koperasi" can never split into two bars by tag order. Reads only
 * `products`; the legacy single-value `product` column is frozen and would
 * fabricate single-tag rows that don't exist.
 */
export const byProduct = (s: AnalysisSession): Bucket[] | null => {
  const tags = filterTikTokProducts(s.products ?? []);
  if (tags.length === 0) return [{ label: "Untagged", sort: 9_999 }];
  return [{ label: tags.join(" + "), sort: -tags.length }];
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
  /**
   * Filtered ÷ Total over PAIRED lives only, as a percentage. Null when fewer
   * than MIN_PAIRED lives have both numbers.
   */
  qualityRate: number | null;
  totalViews: number;
  avgPeakViewers: number | null;
  liveHours: number;
  livesWithLeads: number;
  /** Lives with Filtered Leads entered — the `filteredLeads` sum's own sample. */
  livesWithFiltered: number;
  /** Lives where BOTH lead numbers were entered — the quality rate's real sample. */
  livesWithBoth: number;
  pairedTotal: number;
  pairedFiltered: number;
};

/** Below this many paired lives, a quality percentage is noise, so we show "—". */
export const MIN_PAIRED = 5;

/**
 * Every headline card, computed from the SAME (date-filtered) rows the charts
 * use — so a card can never disagree with the chart beneath it.
 */
export function summaryCards(sessions: AnalysisSession[]): Summary {
  let totalLeads = 0;
  let filteredLeads = 0;
  let livesWithLeads = 0;
  let livesWithFiltered = 0;
  let totalViews = 0;
  let durationSec = 0;
  const peaks: number[] = [];
  // The quality rate's own sample: only lives with BOTH numbers entered.
  let livesWithBoth = 0;
  let pairedTotal = 0;
  let pairedFiltered = 0;

  for (const s of sessions) {
    if (s.totalLeads != null) {
      totalLeads += s.totalLeads;
      livesWithLeads += 1;
    }
    if (s.filteredLeads != null) {
      filteredLeads += s.filteredLeads;
      livesWithFiltered += 1;
    }
    // Pair the two before dividing. Accumulating them independently and then
    // dividing lets a live with Filtered entered but Total blank raise the
    // numerator against a denominator it never contributed to — which can push
    // the rate past 100%. There IS such a live in production today.
    if (s.totalLeads != null && s.filteredLeads != null) {
      livesWithBoth += 1;
      pairedTotal += s.totalLeads;
      pairedFiltered += s.filteredLeads;
    }
    if (s.totalViews != null) totalViews += s.totalViews;
    if (s.durationSeconds != null) durationSec += s.durationSeconds;
    if (s.peakViewers != null) peaks.push(s.peakViewers);
  }

  return {
    sessions: sessions.length,
    totalLeads,
    filteredLeads,
    qualityRate:
      livesWithBoth >= MIN_PAIRED && pairedTotal > 0
        ? round1((pairedFiltered / pairedTotal) * 100)
        : null,
    totalViews,
    avgPeakViewers:
      peaks.length > 0
        ? Math.round(peaks.reduce((a, b) => a + b, 0) / peaks.length)
        : null,
    liveHours: round1(durationSec / 3600),
    livesWithLeads,
    livesWithFiltered,
    livesWithBoth,
    pairedTotal,
    pairedFiltered,
  };
}
