/**
 * Pure ROAS arithmetic. Aggregation queries live in lib/roas/aggregate.ts.
 */

export type Counts = {
  leads: number;
  approved: number; // sales-confirmed approved (incl. closed)
  closed: number;
  rejected: number;
  outcomes: number; // leads with any disposition (approved/closed/rejected/not_suitable/unreachable)
};

export type Money = {
  spend: number; // MYR
  revenue: number; // MYR (from matched approved/closed sales_records)
};

/** Ad-platform-reported activity (from ad_spend). */
export type AdStats = {
  impressions: number;
  clicks: number;
  platformConversions: number; // what the platform *thinks* converted
};

export type Metrics = Counts & Money & AdStats & {
  cpl: number | null;
  cpa: number | null;
  approvalRate: number; // 0..1
  closeRate: number; // 0..1
  realRoas: number | null; // revenue / spend
  ctr: number | null; // clicks / impressions (0..1)
  avgCpc: number | null; // spend / clicks (MYR)
  // (approved+closed real sales) / platform conversions — the gap between what
  // the ad platform reports and what actually became approved loans. 0..1+.
  leadQuality: number | null;
};

export function metrics(input: Counts & Money & Partial<AdStats>): Metrics {
  const impressions = input.impressions ?? 0;
  const clicks = input.clicks ?? 0;
  const platformConversions = input.platformConversions ?? 0;
  const approvedTotal = input.approved + input.closed;

  const cpl = input.leads > 0 ? input.spend / input.leads : null;
  const cpa = approvedTotal > 0 ? input.spend / approvedTotal : null;
  const approvalRate =
    input.outcomes > 0 ? approvedTotal / input.outcomes : 0;
  const closeRate = input.outcomes > 0 ? approvedTotal / input.outcomes : 0;
  const realRoas = input.spend > 0 ? input.revenue / input.spend : null;
  const ctr = impressions > 0 ? clicks / impressions : null;
  const avgCpc = clicks > 0 ? input.spend / clicks : null;
  const leadQuality =
    platformConversions > 0 ? approvedTotal / platformConversions : null;

  return {
    ...input,
    impressions,
    clicks,
    platformConversions,
    cpl: round(cpl, 2),
    cpa: round(cpa, 2),
    approvalRate: roundNum(approvalRate, 4),
    closeRate: roundNum(closeRate, 4),
    realRoas: round(realRoas, 3),
    ctr: round(ctr, 4),
    avgCpc: round(avgCpc, 2),
    leadQuality: round(leadQuality, 4),
  };
}

function round(n: number | null, digits: number): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function roundNum(n: number, digits: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function fmtMyr(n: number | null): string {
  if (n == null) return "—";
  return `RM ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Money with 2 decimals — for small values like avg CPC. */
export function fmtMyr2(n: number | null): string {
  if (n == null) return "—";
  return `RM ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Integer with thousands separators; em-dash for null. */
export function fmtInt(n: number | null): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString();
}

/** Percent with 2 decimals (CTR etc.); input is 0..1. */
export function fmtPct2(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export function fmtRoas(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(2)}×`;
}
