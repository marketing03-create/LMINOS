/**
 * Lead Drivers (pure, DB-free): which live metrics (Duration → Comments) most
 * move the marketing goals (Total Leads / Filtered Leads)?
 *
 * Every live is one data point. For each input metric we compute a SPEARMAN
 * rank correlation against each goal — "when this metric is higher, are leads
 * consistently higher?" Rank-based on purpose: one viral live can't distort the
 * score the way it would a plain average/Pearson. Scores read -1..+1.
 *
 * This is a "where to experiment first" ranking, NOT proof of cause — the UI
 * says so. Metrics need at least MIN_SAMPLE lives with both numbers recorded.
 */

export const MIN_SAMPLE = 5;

export type DriverSessionInput = {
  durationSeconds: number | null;
  peakViewers: number | null;
  avgViewers: number | null;
  totalViews: number | null;
  newFollowers: number | null;
  totalLikes: number | null;
  totalComments: number | null;
  totalShares: number | null;
  totalLeads: number | null;
  filteredLeads: number | null;
};

export type DriverMetricKey =
  | "durationMinutes"
  | "totalViews"
  | "peakViewers"
  | "avgViewers"
  | "newFollowers"
  | "totalLikes"
  | "totalComments"
  | "totalShares"
  | "commentsPerView"
  | "likesPerView";

export const DRIVER_METRICS: { key: DriverMetricKey; label: string; kind: "raw" | "rate" }[] = [
  { key: "durationMinutes", label: "Duration (min)", kind: "raw" },
  { key: "totalViews", label: "Views", kind: "raw" },
  { key: "peakViewers", label: "Peak viewers", kind: "raw" },
  { key: "avgViewers", label: "Avg viewers", kind: "raw" },
  { key: "newFollowers", label: "New followers", kind: "raw" },
  { key: "totalLikes", label: "Likes", kind: "raw" },
  { key: "totalComments", label: "Comments", kind: "raw" },
  { key: "totalShares", label: "Shares", kind: "raw" },
  // Quality rates — separate audience QUALITY from sheer live size.
  { key: "commentsPerView", label: "Comments per 100 views", kind: "rate" },
  { key: "likesPerView", label: "Likes per 100 views", kind: "rate" },
];

export type DriverRow = Record<DriverMetricKey, number | null> & {
  totalLeads: number | null;
  filteredLeads: number | null;
};

/** Map one live session to the analysis row (derives duration + the rates). */
export function sessionToDriverRow(s: DriverSessionInput): DriverRow {
  const views = s.totalViews;
  const rate = (num: number | null) =>
    views != null && views > 0 && num != null ? (num / views) * 100 : null;
  return {
    durationMinutes: s.durationSeconds != null ? s.durationSeconds / 60 : null,
    totalViews: s.totalViews,
    peakViewers: s.peakViewers,
    avgViewers: s.avgViewers,
    newFollowers: s.newFollowers,
    totalLikes: s.totalLikes,
    totalComments: s.totalComments,
    totalShares: s.totalShares,
    commentsPerView: rate(s.totalComments),
    likesPerView: rate(s.totalLikes),
    totalLeads: s.totalLeads,
    filteredLeads: s.filteredLeads,
  };
}

/** Average ranks (1-based), ties share the mean rank. */
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k][1]] = avg;
    i = j + 1;
  }
  return out;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n === 0) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null; // no variation → no signal
  return num / Math.sqrt(dx * dy);
}

/**
 * Spearman rank correlation, -1..+1. Null when there are fewer than MIN_SAMPLE
 * pairs or a side has zero variation (e.g. every live got the same likes).
 */
export function spearman(pairs: [number, number][]): number | null {
  if (pairs.length < MIN_SAMPLE) return null;
  const xs = ranks(pairs.map((p) => p[0]));
  const ys = ranks(pairs.map((p) => p[1]));
  return pearson(xs, ys);
}

export type DriverScore = {
  key: DriverMetricKey;
  label: string;
  kind: "raw" | "rate";
  n: number; // paired lives used
  score: number | null; // -1..+1, null = not enough data / no variation
  verdict: string; // plain-English reading
};

export function verdictFor(score: number | null, n: number): string {
  if (score == null) {
    return n < MIN_SAMPLE
      ? `Needs ≥${MIN_SAMPLE} lives with this recorded`
      : "No variation to learn from yet";
  }
  if (score >= 0.7) return "Strong driver — leads rise with this";
  if (score >= 0.4) return "Helps — clear positive push";
  if (score >= 0.2) return "Slight positive effect";
  if (score > -0.2) return "No real effect";
  if (score > -0.4) return "Slight negative pull";
  return "Pushes leads DOWN — investigate";
}

export type GoalDrivers = {
  goal: "totalLeads" | "filteredLeads";
  goalLabel: string;
  /** Lives that have this goal recorded at all. */
  n: number;
  drivers: DriverScore[];
};

// ── View 2: three plain buckets (no numbers) ──
export type DriverBuckets = { up: string[]; flat: string[]; down: string[] };

/** Bucket the scored metrics into "more leads / no clear effect / fewer leads". */
export function bucketizeDrivers(drivers: DriverScore[]): DriverBuckets {
  const up: string[] = [];
  const flat: string[] = [];
  const down: string[] = [];
  for (const d of drivers) {
    if (d.score != null && d.score >= 0.3) up.push(d.label);
    else if (d.score != null && d.score <= -0.3) down.push(d.label);
    else flat.push(d.label);
  }
  return { up, flat, down };
}

// ── View 3: winning lives vs weak lives, in real units ──
export type GroupComparisonRow = {
  key: DriverMetricKey;
  label: string;
  winnersAvg: number | null;
  weakAvg: number | null;
  note: string; // plain-English takeaway
};

export type GroupComparison = {
  goal: "totalLeads" | "filteredLeads";
  n: number; // lives with the goal recorded
  winners: number; // group sizes
  weak: number;
  rows: GroupComparisonRow[];
};

const avgOf = (vals: number[]): number | null =>
  vals.length >= 2 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

function comparisonNote(winners: number | null, weak: number | null): string {
  if (winners == null || weak == null) return "not enough data";
  if (weak === 0) {
    return winners > 0 ? "only your winning lives have this" : "about the same";
  }
  const r = winners / weak;
  if (r >= 1.5) return `${(Math.round(r * 10) / 10).toFixed(1)}× more in winning lives`;
  if (r >= 1.15) return "somewhat higher in winning lives";
  if (r > 0.87) return "about the same";
  if (r > 0.67) return "somewhat lower in winning lives";
  return "clearly LOWER in winning lives";
}

/**
 * Split the lives that have the goal recorded into a high-lead half ("winning")
 * and a low-lead half ("weak"), then compare each metric's average between the
 * two groups — real units, no abstract score. Median split by the goal value.
 */
export function compareWinningVsWeak(
  rows: DriverRow[],
  goal: "totalLeads" | "filteredLeads"
): GroupComparison {
  const withGoal = rows
    .filter((r) => r[goal] != null)
    .sort((a, b) => (b[goal] as number) - (a[goal] as number));
  const n = withGoal.length;
  if (n < MIN_SAMPLE) {
    return { goal, n, winners: 0, weak: 0, rows: [] };
  }
  const half = Math.ceil(n / 2);
  const winners = withGoal.slice(0, half);
  const weak = withGoal.slice(half);

  const out: GroupComparisonRow[] = DRIVER_METRICS.map(({ key, label }) => {
    const w = avgOf(winners.map((r) => r[key]).filter((v): v is number => v != null));
    const l = avgOf(weak.map((r) => r[key]).filter((v): v is number => v != null));
    return { key, label, winnersAvg: w, weakAvg: l, note: comparisonNote(w, l) };
  });

  return { goal, n, winners: winners.length, weak: weak.length, rows: out };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rank every metric's impact on each goal. Drivers sort strongest |score|
 * first; not-enough-data metrics sink to the bottom.
 */
export function computeLeadDrivers(rows: DriverRow[]): GoalDrivers[] {
  const goals: { goal: "totalLeads" | "filteredLeads"; goalLabel: string }[] = [
    { goal: "totalLeads", goalLabel: "Total Leads" },
    { goal: "filteredLeads", goalLabel: "Filtered Leads" },
  ];

  return goals.map(({ goal, goalLabel }) => {
    const withGoal = rows.filter((r) => r[goal] != null);
    const drivers = DRIVER_METRICS.map(({ key, label, kind }) => {
      const pairs: [number, number][] = [];
      for (const r of withGoal) {
        const x = r[key];
        const y = r[goal];
        if (x != null && y != null) pairs.push([x, y]);
      }
      const s = spearman(pairs);
      return {
        key,
        label,
        kind,
        n: pairs.length,
        score: s == null ? null : round2(s),
        verdict: verdictFor(s, pairs.length),
      };
    });
    drivers.sort((a, b) => {
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return Math.abs(b.score) - Math.abs(a.score);
    });
    return { goal, goalLabel, n: withGoal.length, drivers };
  });
}
