/**
 * Source Statistics API (Finance Connect) — pure parsing and sums. No I/O, so
 * it is unit-tested; the fetching lives in source-stats.ts.
 *
 * The API returns totals only (never customer, case or staff details). Partner
 * names (organisations' referral partners) are confidential to the marketing
 * team, so they are dropped here and never reach a page.
 */

export const PLATFORMS = [
  "tiktok",
  "facebook",
  "google",
  "website",
  "referral",
  "cold_calling",
  "returning",
  "unattributed",
  "other",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export type Money = { count: number; amount: number };
export type Sales = Money & { newCustomer: Money; returning: Money; inherited: Money };
export type Leads = {
  received: number;
  open: number;
  pending: number;
  approved: number;
  rejected: number;
  lost: number;
  /** approved ÷ received, 0–1; null when no leads arrived. */
  conversion: number | null;
};
export type SourceLine = {
  key: string;
  name: string;
  typeLabel: string;
  platform: string;
  sales: Sales;
  leads: Leads | null;
};
export type PlatformLine = { platform: string; label: string; sales: Sales; leads: Leads | null };
export type SourceStats = {
  from: string;
  to: string;
  generatedAt: string | null;
  totals: { sales: Sales; leads: Leads | null };
  platforms: PlatformLine[];
  sources: SourceLine[];
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown, fallback = ""): string => (typeof v === "string" && v.trim() ? v.trim() : fallback);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function money(v: unknown): Money {
  const o = obj(v);
  return { count: num(o.count), amount: num(o.loan_amount) };
}

export function parseSales(v: unknown): Sales {
  const o = obj(v);
  return {
    ...money(o),
    newCustomer: money(o.new_customer),
    returning: money(o.returning_customer),
    inherited: money(o.inherited),
  };
}

export function parseLeads(v: unknown): Leads | null {
  if (v == null || typeof v !== "object") return null;
  const o = obj(v);
  const received = num(o.received);
  const approved = num(o.approved);
  const rate = o.conversion_rate;
  return {
    received,
    open: num(o.open),
    pending: num(o.pending_approval),
    approved,
    rejected: num(o.rejected),
    lost: num(o.lost),
    conversion:
      typeof rate === "number" && Number.isFinite(rate) ? rate : received > 0 ? approved / received : null,
  };
}

/** The API's `data` object → what the page shows. Throws on a body with no data. */
export function parseSourceStats(body: unknown): SourceStats {
  const b = obj(body);
  if (b.status !== 1) throw new Error(`source-stats: ${str(b.system, "error")}`);
  const d = obj(b.data);
  const period = obj(d.period);
  const totals = obj(d.totals);
  const platforms = (Array.isArray(d.by_platform) ? d.by_platform : []).map((p): PlatformLine => {
    const o = obj(p);
    return { platform: str(o.platform), label: str(o.platform_label, str(o.platform)), sales: parseSales(o.sales), leads: parseLeads(o.leads) };
  });
  const sources = (Array.isArray(d.sources) ? d.sources : []).map((s): SourceLine => {
    const o = obj(s);
    // `partners` (confidential names) is deliberately not read.
    return {
      key: str(o.source_key, str(o.source_name)),
      name: str(o.source_name, str(o.source_key, "Unnamed")),
      typeLabel: str(o.source_type_label, str(o.source_type)),
      platform: str(o.platform, "other"),
      sales: parseSales(o.sales),
      leads: parseLeads(o.leads),
    };
  });
  // Biggest first: loan amount, then approved loans, then leads.
  sources.sort(
    (a, b) =>
      b.sales.amount - a.sales.amount ||
      b.sales.count - a.sales.count ||
      (b.leads?.received ?? 0) - (a.leads?.received ?? 0)
  );
  platforms.sort((a, b) => b.sales.amount - a.sales.amount || b.sales.count - a.sales.count);
  return {
    from: str(period.date_from),
    to: str(period.date_to),
    generatedAt: str(d.generated_at) || null,
    totals: { sales: parseSales(totals.sales), leads: parseLeads(totals.leads) },
    platforms,
    sources,
  };
}

/** Cache key for one request: dates + the platform filter in a fixed order. */
export function statsKey(from: string, to: string, platforms: readonly string[]): string {
  return `${from}|${to}|${[...platforms].sort().join(",") || "all"}`;
}

/**
 * How long a cached answer stays good. A range that reaches today keeps
 * changing (new leads, approvals) → 3 hours; a closed range only moves as old
 * leads get approved → 24 hours. The API asks for about one call a day.
 */
export function maxAgeMs(to: string, today: string): number {
  return to >= today ? 3 * 3_600_000 : 24 * 3_600_000;
}

/** "RM 61,000" */
export function rm(amount: number): string {
  return `RM ${Math.round(amount).toLocaleString("en-MY")}`;
}

/** 0.125 → "12.5%", null → "—" */
export function pct(rate: number | null): string {
  if (rate == null) return "—";
  return `${Number((rate * 100).toFixed(1))}%`;
}
