/**
 * Overview page maths (pure, DB-free): coverage, pooled rates, per-streamer rows,
 * best/weakest lives and the data-entry chase list.
 *
 * Two rules run through every function here, both learned from this dataset:
 *
 * 1. PAIRWISE. A live only enters a rate when BOTH its numerator and denominator
 *    are recorded. Total Leads sits on 19% of lives while duration sits on 100%,
 *    so dividing a leads sum by every live's hours understates the true rate ~4×.
 *
 * 2. ABSENT IS NOT ZERO. A blank means nobody typed it in. Rendering it as 0
 *    turns a data-entry gap into a performance verdict about a named person —
 *    so these functions return `null`, never `0`, when there is nothing to say.
 *
 * All clock maths is Malaysia time (UTC+8, no DST).
 */

import {
  aggregate,
  mytDate,
  mytHour,
  type Agg,
  type AnalysisSession,
  type Bucket,
  type ChartRow,
} from "./live-analysis-core";

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Coverage ────────────────────────────────────────────────────────────────

/**
 * Why a field can be blank determines how we're allowed to describe it.
 *
 * - `typed`  nullable; a human owes us the number. Chasing them fixes it.
 * - `auto`   NOT NULL DEFAULT 0 — the connector writes it. A stored 0 cannot be
 *            told apart from a live we failed to capture, so "how many are
 *            filled" is unanswerable and any percentage is a CEILING, not a
 *            fill rate. Never scored red/green: nobody can act on it.
 * - `tag`    a text[] the streamer sets.
 */
export type FieldKind = "typed" | "auto" | "tag";

export type CoverageField = {
  key: string;
  label: string;
  kind: FieldKind;
  has: (s: AnalysisSession) => boolean;
};

const typed = (
  key: string,
  label: string,
  get: (s: AnalysisSession) => number | null
): CoverageField => ({ key, label, kind: "typed", has: (s) => get(s) != null });

const auto = (
  key: string,
  label: string,
  get: (s: AnalysisSession) => number | null
): CoverageField => ({
  key,
  label,
  kind: "auto",
  // `> 0` is the only signal available; see FieldKind."auto".
  has: (s) => (get(s) ?? 0) > 0,
});

/** Fields a person is expected to fill in — the chase-able ones. */
export const TYPED_FIELDS: CoverageField[] = [
  typed("totalLeads", "Total Leads", (s) => s.totalLeads),
  typed("filteredLeads", "Filtered Leads", (s) => s.filteredLeads),
  typed("directMessages", "Direct messages", (s) => s.directMessages),
  typed("serviceBioViews", "Bio views", (s) => s.serviceBioViews),
  typed("avgWatchSeconds", "Avg watch time", (s) => s.avgWatchSeconds),
  typed("uniqueViewers", "Unique viewers", (s) => s.uniqueViewers),
  typed("newFollowers", "New followers", (s) => s.newFollowers),
  {
    key: "products",
    label: "Product tags",
    kind: "tag",
    has: (s) => (s.products?.length ?? 0) > 0,
  },
];

/**
 * Captured by the connector. `diamonds` is deliberately absent — the schema calls
 * gifts irrelevant to loan marketing, so a 0% bar would only invite someone to
 * start typing a number nobody uses.
 */
export const AUTO_FIELDS: CoverageField[] = [
  auto("totalViews", "Views", (s) => s.totalViews),
  auto("peakViewers", "Peak viewers", (s) => s.peakViewers),
  auto("durationSeconds", "Duration", (s) => s.durationSeconds),
  auto("totalLikes", "Likes", (s) => s.totalLikes),
  auto("totalComments", "Comments", (s) => s.totalComments),
  auto("keywordLeads", "Keyword comments", (s) => s.keywordLeads),
];

export type Coverage = {
  key: string;
  label: string;
  kind: FieldKind;
  filled: number;
  total: number;
  /** Null below MIN_COVERAGE_BASE lives — a percentage of 4 things misleads. */
  pct: number | null;
};

export const MIN_COVERAGE_BASE = 10;

export function coverage(
  sessions: AnalysisSession[],
  fields: CoverageField[]
): Coverage[] {
  const total = sessions.length;
  return fields.map((f) => {
    const filled = sessions.reduce((n, s) => n + (f.has(s) ? 1 : 0), 0);
    return {
      key: f.key,
      label: f.label,
      kind: f.kind,
      filled,
      total,
      pct:
        total >= MIN_COVERAGE_BASE ? Math.round((filled / total) * 100) : null,
    };
  });
}

// ── Pooled, pairwise-complete rates ─────────────────────────────────────────

export type Rate = {
  /** Null when fewer than `minLives` lives have BOTH parts recorded. */
  value: number | null;
  /** How many lives the rate actually rests on. */
  lives: number;
  /** Which handles contributed — so "All streamers" can admit it means one. */
  handles: string[];
};

export const MIN_RATE_LIVES = 5;

/**
 * sum(numerator) ÷ sum(denominator) over lives where BOTH are present.
 *
 * Ratio-of-sums, never the mean of per-live ratios: a 40-view live must not
 * outvote a 4,000-view one.
 */
export function pooledRate(
  sessions: AnalysisSession[],
  num: (s: AnalysisSession) => number | null,
  den: (s: AnalysisSession) => number | null,
  opts: { scale?: number; minLives?: number; round?: (n: number) => number } = {}
): Rate {
  const { scale = 1, minLives = MIN_RATE_LIVES, round = round1 } = opts;
  let n = 0;
  let d = 0;
  let lives = 0;
  const handles = new Set<string>();

  for (const s of sessions) {
    const a = num(s);
    const b = den(s);
    if (a == null || b == null || !(b > 0)) continue;
    n += a;
    d += b;
    lives += 1;
    handles.add(s.handle);
  }

  return {
    value: lives >= minLives && d > 0 ? round((n / d) * scale) : null,
    lives,
    handles: [...handles].sort(),
  };
}

/** Hours streamed, as a rate denominator. */
export const hours = (s: AnalysisSession) =>
  s.durationSeconds == null ? null : s.durationSeconds / 3600;

export type RateDef = {
  key: string;
  name: string;
  num: (s: AnalysisSession) => number | null;
  den: (s: AnalysisSession) => number | null;
  scale?: number;
};

/**
 * Bucket-and-pool: one pooled rate per bucket. Unlike `buildChart`, the value is
 * NOT re-aggregatable — a rate is always sum÷sum, so SUM/AVG/MIN/MAX of it would
 * each mean a different computation. Charts built from this lock their picker.
 */
export function buildRateChart(
  sessions: AnalysisSession[],
  bucketsOf: (s: AnalysisSession) => Bucket[] | null,
  rates: RateDef[]
): ChartRow[] {
  const m = new Map<
    string,
    { sort: number; n: number; acc: Map<string, { n: number; d: number; lives: number }> }
  >();

  for (const s of sessions) {
    const buckets = bucketsOf(s);
    if (!buckets?.length) continue;
    for (const b of buckets) {
      const g = m.get(b.label) ?? { sort: b.sort, n: 0, acc: new Map() };
      g.n += 1;
      for (const r of rates) {
        const a = r.num(s);
        const d = r.den(s);
        if (a == null || d == null || !(d > 0)) continue;
        const cur = g.acc.get(r.key) ?? { n: 0, d: 0, lives: 0 };
        cur.n += a;
        cur.d += d;
        cur.lives += 1;
        g.acc.set(r.key, cur);
      }
      m.set(b.label, g);
    }
  }

  return [...m.entries()]
    .sort((a, b) => a[1].sort - b[1].sort)
    .map(([label, g]) => {
      const row: ChartRow = { label, n: g.n };
      for (const r of rates) {
        const cur = g.acc.get(r.key);
        row[r.key] = cur && cur.d > 0 ? round1((cur.n / cur.d) * (r.scale ?? 1)) : null;
        row[`${r.key}_n`] = cur?.lives ?? 0;
      }
      return row;
    });
}

/**
 * A chart's headline "average value": the metric's total across the period
 * divided by the number of DAYS that had a live (not the number of lives, and
 * not the number of days in the range — days with no live would drag it down).
 *
 * Deliberately per-day rather than per-hour: it answers "on a day we go live,
 * what do we get?", which is the unit a schedule is planned in. Its unit differs
 * from a per-hour line, so callers must always render it with its own unit.
 */
export function dailyAverage(
  sessions: AnalysisSession[],
  get: (s: AnalysisSession) => number | null
): { value: number | null; days: number; lives: number } {
  const days = new Set<string>();
  let total = 0;
  let lives = 0;

  for (const s of sessions) {
    const v = get(s);
    if (v == null || !Number.isFinite(v) || !s.startedAt) continue;
    total += v;
    lives += 1;
    days.add(mytDate(s.startedAt));
  }

  return {
    value: days.size > 0 ? round1(total / days.size) : null,
    days: days.size,
    lives,
  };
}

// ── Buckets ─────────────────────────────────────────────────────────────────

/**
 * Six named blocks rather than 24 hourly bins: 72 lives across 24 bins leaves
 * almost every bin at n<3, which reads as precision that isn't there.
 */
export const PART_OF_DAY = [
  { label: "12am–6am", from: 0, to: 6 },
  { label: "6am–12pm", from: 6, to: 12 },
  { label: "12pm–3pm", from: 12, to: 15 },
  { label: "3pm–6pm", from: 15, to: 18 },
  { label: "6pm–9pm", from: 18, to: 21 },
  { label: "9pm–12am", from: 21, to: 24 },
] as const;

/** Bucketed on the hour the live STARTED, so a 4-hour live counts once. */
export const byPartOfDay = (s: AnalysisSession): Bucket[] | null => {
  if (!s.startedAt) return null;
  const h = mytHour(s.startedAt);
  const i = PART_OF_DAY.findIndex((p) => h >= p.from && h < p.to);
  if (i < 0) return null;
  return [{ label: PART_OF_DAY[i].label, sort: i }];
};

export const byHandle = (s: AnalysisSession): Bucket[] | null => [
  { label: s.handle, sort: 0 },
];

// ── Per-streamer comparison ─────────────────────────────────────────────────

export type StreamerRow = {
  accountId: string;
  handle: string;
  lives: number;
  liveHours: number;
  viewsPerHour: number | null;
  medianPeak: number | null;
  commentsPer1kViews: number | null;
  followersPerHour: number | null;
  /** How many of this handle's lives have Total Leads keyed in. */
  livesWithLeads: number;
  /** Null (not 0) when nobody ever entered a lead figure for this handle. */
  totalLeads: number | null;
  leadsPerHour: number | null;
  qualityRate: number | null;
  livesWithBoth: number;
};

/**
 * One row per handle. Every rate is pooled and pairwise, and every lead figure is
 * `null` rather than `0` when unrecorded — this is the one place a data gap would
 * otherwise become a public judgement about a named person.
 */
export function streamerRows(sessions: AnalysisSession[]): StreamerRow[] {
  const byAcct = new Map<string, AnalysisSession[]>();
  for (const s of sessions) {
    const arr = byAcct.get(s.accountId) ?? [];
    arr.push(s);
    byAcct.set(s.accountId, arr);
  }

  const rows: StreamerRow[] = [];
  for (const [accountId, rows_] of byAcct) {
    const durSec = rows_.reduce((t, s) => t + (s.durationSeconds ?? 0), 0);
    const peaks = rows_.map((s) => s.peakViewers).filter((v): v is number => v != null);

    const livesWithLeads = rows_.filter((s) => s.totalLeads != null).length;
    const leadSum = rows_.reduce((t, s) => t + (s.totalLeads ?? 0), 0);

    let pairedTotal = 0;
    let pairedFiltered = 0;
    let livesWithBoth = 0;
    for (const s of rows_) {
      if (s.totalLeads != null && s.filteredLeads != null) {
        pairedTotal += s.totalLeads;
        pairedFiltered += s.filteredLeads;
        livesWithBoth += 1;
      }
    }

    rows.push({
      accountId,
      handle: rows_[0].handle,
      lives: rows_.length,
      liveHours: round1(durSec / 3600),
      viewsPerHour: pooledRate(rows_, (s) => s.totalViews, hours, { minLives: 1 })
        .value,
      medianPeak: peaks.length ? aggregate(peaks, "MEDIAN") : null,
      commentsPer1kViews: pooledRate(
        rows_,
        (s) => s.totalComments,
        (s) => s.totalViews,
        { scale: 1000, minLives: 1, round: round2 }
      ).value,
      followersPerHour: pooledRate(rows_, (s) => s.newFollowers, hours, {
        minLives: 1,
      }).value,
      livesWithLeads,
      totalLeads: livesWithLeads > 0 ? leadSum : null,
      leadsPerHour: pooledRate(
        rows_,
        (s) => s.totalLeads,
        hours,
        { minLives: 1 }
      ).value,
      qualityRate:
        livesWithBoth > 0 && pairedTotal > 0
          ? round1((pairedFiltered / pairedTotal) * 100)
          : null,
      livesWithBoth,
    });
  }

  // Lives descending — a neutral, descriptive ordering. Never sort on a lead
  // column: that would rank people by how diligently someone else typed.
  return rows.sort((a, b) => b.lives - a.lives);
}

/** Handles in scope that have at least one recorded lead figure. */
export function handlesWithLeads(sessions: AnalysisSession[]): {
  withLeads: string[];
  withoutLeads: { handle: string; lives: number }[];
} {
  const all = new Map<string, { withLead: boolean; lives: number }>();
  for (const s of sessions) {
    const cur = all.get(s.handle) ?? { withLead: false, lives: 0 };
    cur.lives += 1;
    if (s.totalLeads != null) cur.withLead = true;
    all.set(s.handle, cur);
  }
  return {
    withLeads: [...all].filter(([, v]) => v.withLead).map(([h]) => h).sort(),
    withoutLeads: [...all]
      .filter(([, v]) => !v.withLead)
      .map(([handle, v]) => ({ handle, lives: v.lives }))
      .sort((a, b) => b.lives - a.lives),
  };
}

// ── Best / weakest lives ────────────────────────────────────────────────────

export type RankedLive = {
  id: string;
  handle: string;
  startedAt: string | null;
  durationMinutes: number;
  totalViews: number | null;
  viewsPerHour: number;
  products: string[] | null;
  totalLeads: number | null;
};

/** Lives shorter than this are excluded — a 6-minute live tops any rate chart. */
export const MIN_RANK_SECONDS = 1800;

/**
 * Ranked on views per live hour, which is ~100% filled and therefore works for
 * every handle. Deliberately NOT ranked on leads (19%, one handle) or keyword
 * comments (a config artifact — see the keyword-capture column).
 */
export function topLives(
  sessions: AnalysisSession[],
  n = 5
): { best: RankedLive[]; weakest: RankedLive[] } {
  const eligible = sessions
    .filter(
      (s) =>
        (s.durationSeconds ?? 0) >= MIN_RANK_SECONDS && (s.totalViews ?? 0) > 0
    )
    .map<RankedLive>((s) => ({
      id: s.id,
      handle: s.handle,
      startedAt: s.startedAt,
      durationMinutes: Math.round((s.durationSeconds ?? 0) / 60),
      totalViews: s.totalViews,
      viewsPerHour: round1((s.totalViews ?? 0) / ((s.durationSeconds ?? 1) / 3600)),
      products: s.products,
      totalLeads: s.totalLeads,
    }))
    .sort((a, b) => b.viewsPerHour - a.viewsPerHour);

  // With few lives the two lists would overlap and show the same live as both
  // best and weakest, which destroys trust in the whole section.
  if (eligible.length < n * 2) {
    return { best: eligible.slice(0, n), weakest: [] };
  }
  return { best: eligible.slice(0, n), weakest: eligible.slice(-n).reverse() };
}

// ── Chase list ──────────────────────────────────────────────────────────────

export type ChaseRow = {
  id: string;
  handle: string;
  startedAt: string | null;
  totalViews: number | null;
  /** Human labels of what's still blank. */
  missing: string[];
  /** Filtered entered but Total blank — the pairing that corrupts a quality %. */
  filteredWithoutTotal: boolean;
};

/** Ignore accidental taps — anything under 5 minutes isn't a real live. */
export const MIN_CHASE_SECONDS = 300;

const CHASE_FIELDS: { key: keyof AnalysisSession; label: string }[] = [
  { key: "totalLeads", label: "Total Leads" },
  { key: "filteredLeads", label: "Filtered Leads" },
  { key: "directMessages", label: "DMs" },
  { key: "serviceBioViews", label: "Bio views" },
];

/**
 * Lives still missing numbers, biggest audience first — that's the order to work
 * through them, NOT a guess at which live got the most leads.
 */
export function chaseList(sessions: AnalysisSession[], limit = 10): {
  rows: ChaseRow[];
  totalIncomplete: number;
} {
  const all = sessions
    .filter((s) => (s.durationSeconds ?? 0) >= MIN_CHASE_SECONDS)
    .map<ChaseRow>((s) => ({
      id: s.id,
      handle: s.handle,
      startedAt: s.startedAt,
      totalViews: s.totalViews,
      missing: CHASE_FIELDS.filter((f) => s[f.key] == null).map((f) => f.label),
      filteredWithoutTotal: s.totalLeads == null && s.filteredLeads != null,
    }))
    .filter((r) => r.missing.length > 0)
    .sort((a, b) => (b.totalViews ?? 0) - (a.totalViews ?? 0));

  return { rows: all.slice(0, limit), totalIncomplete: all.length };
}

// ── Connector-miss flag ─────────────────────────────────────────────────────

/**
 * Lives that ran a while, drew views, but recorded no likes OR no comments —
 * the shape of a capture failure rather than a quiet room. Restricted to likes
 * and comments on purpose: zero SHARES on a niche Malaysian loan live is an
 * ordinary outcome, and flagging those would cry wolf on a quarter of all lives.
 */
export function connectorMisses(sessions: AnalysisSession[]): number {
  return sessions.filter(
    (s) =>
      (s.totalViews ?? 0) > 0 &&
      (s.durationSeconds ?? 0) > MIN_CHASE_SECONDS &&
      ((s.totalLikes ?? 0) === 0 || (s.totalComments ?? 0) === 0)
  ).length;
}

/** Distinct product combinations actually in use, excluding untagged lives. */
export function productCombos(sessions: AnalysisSession[]): {
  combos: number;
  tagged: number;
  total: number;
} {
  const combos = new Set<string>();
  let tagged = 0;
  for (const s of sessions) {
    if ((s.products?.length ?? 0) > 0) {
      tagged += 1;
      combos.add([...s.products!].sort().join(" + "));
    }
  }
  return { combos: combos.size, tagged, total: sessions.length };
}

/** Re-export so chart components need only one import. */
export type { Agg, AnalysisSession, ChartRow };
