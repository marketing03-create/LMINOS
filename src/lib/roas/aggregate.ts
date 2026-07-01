import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  sql,
} from "drizzle-orm";
import { db } from "@/db/client";
import {
  adAccounts,
  adSpend,
  ads,
  adSets,
  brands,
  campaigns,
  leads,
  salesRecords,
  teams,
  users,
} from "@/db/schema";
import { metrics, type Metrics } from "./metrics";

export type Dimension =
  | "platform"
  | "campaign"
  | "ad_set"
  | "ad"
  | "brand"
  | "loan_type"
  | "agent"
  | "source_platform"
  | "website";

export type DateRange = { start: Date; end: Date };

export type DimensionRow = {
  key: string; // dimension value (e.g. campaign_id, platform name)
  label: string; // human label
  metrics: Metrics;
};

// Subset of lead_status enum we treat as "confirmed sale".
const CLOSED_LIKE: ("approved" | "closed")[] = ["approved", "closed"];
const OUTCOME_STATUSES = [
  "approved",
  "closed",
  "rejected",
  "not_suitable",
  "unreachable",
] as const;

export function defaultRange(days = 30): DateRange {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

/**
 * Top-line totals — used by /dashboard KPI cards.
 */
export async function topLineMetrics(range: DateRange): Promise<Metrics> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);

  const [spendRow] = await db
    .select({
      spend: sql<number>`coalesce(sum(${adSpend.spend}), 0)::float`,
      impressions: sql<number>`coalesce(sum(${adSpend.impressions}), 0)::float`,
      clicks: sql<number>`coalesce(sum(${adSpend.clicks}), 0)::float`,
      conversions: sql<number>`coalesce(sum(${adSpend.conversions}), 0)::float`,
    })
    .from(adSpend)
    .where(and(gte(adSpend.date, startDate), lt(adSpend.date, endDate)));

  const leadCountsRows = await db
    .select({
      status: leads.leadStatus,
      n: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(
      and(gte(leads.submittedAt, range.start), lt(leads.submittedAt, range.end))
    )
    .groupBy(leads.leadStatus);

  const counts = bucketCounts(
    leadCountsRows.map((r) => ({ key: String(r.status), n: r.n }))
  );

  const [revRow] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${salesRecords.revenueValue}), 0)::float`,
    })
    .from(salesRecords)
    .innerJoin(leads, eq(leads.id, salesRecords.leadId))
    .where(
      and(
        inArray(salesRecords.salesStatus, CLOSED_LIKE),
        gte(leads.submittedAt, range.start),
        lt(leads.submittedAt, range.end)
      )
    );

  return metrics({
    leads: counts.leads,
    approved: counts.approved,
    closed: counts.closed,
    rejected: counts.rejected,
    outcomes: counts.outcomes,
    spend: Number(spendRow?.spend ?? 0),
    revenue: Number(revRow?.revenue ?? 0),
    impressions: Number(spendRow?.impressions ?? 0),
    clicks: Number(spendRow?.clicks ?? 0),
    platformConversions: Number(spendRow?.conversions ?? 0),
  });
}

function bucketCounts(rows: { key: string; n: number }[]) {
  let leadsTotal = 0;
  let approved = 0;
  let closed = 0;
  let rejected = 0;
  let outcomes = 0;
  for (const r of rows) {
    leadsTotal += r.n;
    if (r.key === "approved") approved += r.n;
    if (r.key === "closed") closed += r.n;
    if (r.key === "rejected" || r.key === "not_suitable") rejected += r.n;
    if ((OUTCOME_STATUSES as readonly string[]).includes(r.key)) outcomes += r.n;
  }
  return { leads: leadsTotal, approved, closed, rejected, outcomes };
}

/**
 * Slice metrics by `dimension`. Returns rows sorted by realROAS desc (nulls
 * last), capped to `limit`.
 *
 * Implementation: pull spend grouped by dim, pull lead status counts grouped
 * by dim, pull revenue grouped by dim, then merge in memory. For phase 1
 * data sizes (≤ a few thousand campaigns) this is plenty.
 */
export async function aggregateByDimension(
  dim: Dimension,
  range: DateRange,
  limit = 200
): Promise<DimensionRow[]> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);

  // 1. Build per-dimension spend + label rows.
  const spendByKey = new Map<string, number>();
  const labelByKey = new Map<string, string>();
  // Ad-platform activity (impressions/clicks/conversions), filled from ad_spend
  // for the dimensions that join it (platform/brand/campaign/ad_set/ad/website).
  type AdStat = { impressions: number; clicks: number; platformConversions: number };
  const statsByKey = new Map<string, AdStat>();
  const setStat = (key: string, r: { impr?: number; clk?: number; conv?: number }) =>
    statsByKey.set(key, {
      impressions: Number(r.impr ?? 0),
      clicks: Number(r.clk ?? 0),
      platformConversions: Number(r.conv ?? 0),
    });
  const STAT_COLS = {
    impr: sql<number>`coalesce(sum(${adSpend.impressions}), 0)::float`,
    clk: sql<number>`coalesce(sum(${adSpend.clicks}), 0)::float`,
    conv: sql<number>`coalesce(sum(${adSpend.conversions}), 0)::float`,
  };

  switch (dim) {
    case "platform": {
      const rows = await db
        .select({
          platform: adAccounts.platform,
          spend: sql<number>`coalesce(sum(${adSpend.spend}), 0)::float`,
          ...STAT_COLS,
        })
        .from(adSpend)
        .innerJoin(adAccounts, eq(adAccounts.id, adSpend.adAccountId))
        .where(and(gte(adSpend.date, startDate), lt(adSpend.date, endDate)))
        .groupBy(adAccounts.platform);
      for (const r of rows) {
        spendByKey.set(String(r.platform), Number(r.spend));
        labelByKey.set(String(r.platform), String(r.platform));
        setStat(String(r.platform), r);
      }
      break;
    }
    case "brand": {
      const rows = await db
        .select({
          brandId: adAccounts.brandId,
          brandName: brands.name,
          spend: sql<number>`coalesce(sum(${adSpend.spend}), 0)::float`,
          ...STAT_COLS,
        })
        .from(adSpend)
        .innerJoin(adAccounts, eq(adAccounts.id, adSpend.adAccountId))
        .innerJoin(brands, eq(brands.id, adAccounts.brandId))
        .where(and(gte(adSpend.date, startDate), lt(adSpend.date, endDate)))
        .groupBy(adAccounts.brandId, brands.name);
      for (const r of rows) {
        spendByKey.set(r.brandId, Number(r.spend));
        labelByKey.set(r.brandId, r.brandName);
        setStat(r.brandId, r);
      }
      break;
    }
    case "campaign": {
      const rows = await db
        .select({
          campaignId: adSpend.campaignId,
          name: campaigns.name,
          spend: sql<number>`coalesce(sum(${adSpend.spend}), 0)::float`,
          ...STAT_COLS,
        })
        .from(adSpend)
        .innerJoin(campaigns, eq(campaigns.id, adSpend.campaignId))
        .where(
          and(
            gte(adSpend.date, startDate),
            lt(adSpend.date, endDate),
            isNotNull(adSpend.campaignId)
          )
        )
        .groupBy(adSpend.campaignId, campaigns.name);
      for (const r of rows) {
        const id = r.campaignId!;
        spendByKey.set(id, Number(r.spend));
        labelByKey.set(id, r.name);
        setStat(id, r);
      }
      break;
    }
    case "ad_set": {
      const rows = await db
        .select({
          adSetId: adSpend.adSetId,
          name: adSets.name,
          spend: sql<number>`coalesce(sum(${adSpend.spend}), 0)::float`,
          ...STAT_COLS,
        })
        .from(adSpend)
        .innerJoin(adSets, eq(adSets.id, adSpend.adSetId))
        .where(
          and(
            gte(adSpend.date, startDate),
            lt(adSpend.date, endDate),
            isNotNull(adSpend.adSetId)
          )
        )
        .groupBy(adSpend.adSetId, adSets.name);
      for (const r of rows) {
        const id = r.adSetId!;
        spendByKey.set(id, Number(r.spend));
        labelByKey.set(id, r.name);
        setStat(id, r);
      }
      break;
    }
    case "ad": {
      const rows = await db
        .select({
          adId: adSpend.adId,
          name: ads.name,
          spend: sql<number>`coalesce(sum(${adSpend.spend}), 0)::float`,
          ...STAT_COLS,
        })
        .from(adSpend)
        .innerJoin(ads, eq(ads.id, adSpend.adId))
        .where(
          and(
            gte(adSpend.date, startDate),
            lt(adSpend.date, endDate),
            isNotNull(adSpend.adId)
          )
        )
        .groupBy(adSpend.adId, ads.name);
      for (const r of rows) {
        const id = r.adId!;
        spendByKey.set(id, Number(r.spend));
        labelByKey.set(id, r.name);
        setStat(id, r);
      }
      break;
    }
    case "website": {
      // Spend attributed per-website via ad_accounts.website (one ad account
      // per website). Key = website string, matching the source_channel key
      // used for leads/revenue, so the three merge cleanly.
      const rows = await db
        .select({
          website: adAccounts.website,
          spend: sql<number>`coalesce(sum(${adSpend.spend}), 0)::float`,
          ...STAT_COLS,
        })
        .from(adSpend)
        .innerJoin(adAccounts, eq(adAccounts.id, adSpend.adAccountId))
        .where(
          and(
            gte(adSpend.date, startDate),
            lt(adSpend.date, endDate),
            isNotNull(adAccounts.website)
          )
        )
        .groupBy(adAccounts.website);
      for (const r of rows) {
        if (!r.website) continue;
        spendByKey.set(r.website, Number(r.spend));
        labelByKey.set(r.website, r.website);
        setStat(r.website, r);
      }
      break;
    }
    case "source_platform":
    case "loan_type":
    case "agent": {
      // These dimensions have no spend attribution by themselves; spend is
      // 0 and the row still surfaces lead/revenue counts.
      break;
    }
  }

  // 2. Per-dimension lead counts by status.
  const countsByKey = new Map<
    string,
    { leads: number; approved: number; closed: number; rejected: number; outcomes: number }
  >();

  const counts = await leadCountsByDim(dim, range, labelByKey);
  for (const [k, v] of counts) {
    countsByKey.set(k, v);
  }

  // 3. Per-dimension revenue.
  const revByKey = await revenueByDim(dim, range, labelByKey);

  // 4. Merge all keys.
  const allKeys = new Set<string>([
    ...spendByKey.keys(),
    ...countsByKey.keys(),
    ...revByKey.keys(),
  ]);

  const out: DimensionRow[] = [];
  for (const key of allKeys) {
    const c = countsByKey.get(key) ?? {
      leads: 0,
      approved: 0,
      closed: 0,
      rejected: 0,
      outcomes: 0,
    };
    const s = statsByKey.get(key);
    const m = metrics({
      ...c,
      spend: spendByKey.get(key) ?? 0,
      revenue: revByKey.get(key) ?? 0,
      impressions: s?.impressions ?? 0,
      clicks: s?.clicks ?? 0,
      platformConversions: s?.platformConversions ?? 0,
    });
    out.push({
      key,
      label: labelByKey.get(key) ?? key,
      metrics: m,
    });
  }

  // Sort by realROAS desc (nulls last), then revenue desc.
  out.sort((a, b) => {
    const aR = a.metrics.realRoas;
    const bR = b.metrics.realRoas;
    if (aR == null && bR == null) return b.metrics.revenue - a.metrics.revenue;
    if (aR == null) return 1;
    if (bR == null) return -1;
    if (bR !== aR) return bR - aR;
    return b.metrics.revenue - a.metrics.revenue;
  });

  return out.slice(0, limit);
}

async function leadCountsByDim(
  dim: Dimension,
  range: DateRange,
  labelByKey: Map<string, string>
): Promise<Map<string, { leads: number; approved: number; closed: number; rejected: number; outcomes: number }>> {
  const out = new Map<
    string,
    { leads: number; approved: number; closed: number; rejected: number; outcomes: number }
  >();

  type RowShape = { key: string | null; label?: string | null; status: string; n: number };
  let rows: RowShape[] = [];

  switch (dim) {
    case "platform": {
      rows = (await db
        .select({
          key: adAccounts.platform,
          status: leads.leadStatus,
          n: sql<number>`count(*)::int`,
        })
        .from(leads)
        .innerJoin(adAccounts, eq(adAccounts.id, leads.adAccountId))
        .where(
          and(
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(adAccounts.platform, leads.leadStatus)) as unknown as RowShape[];
      break;
    }
    case "brand": {
      const r = await db
        .select({
          key: leads.brandId,
          label: brands.name,
          status: leads.leadStatus,
          n: sql<number>`count(*)::int`,
        })
        .from(leads)
        .innerJoin(brands, eq(brands.id, leads.brandId))
        .where(
          and(
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.brandId, brands.name, leads.leadStatus);
      rows = r as unknown as RowShape[];
      for (const x of r) labelByKey.set(x.key, x.label);
      break;
    }
    case "campaign": {
      const r = await db
        .select({
          key: leads.campaignId,
          label: campaigns.name,
          status: leads.leadStatus,
          n: sql<number>`count(*)::int`,
        })
        .from(leads)
        .innerJoin(campaigns, eq(campaigns.id, leads.campaignId))
        .where(
          and(
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.campaignId, campaigns.name, leads.leadStatus);
      rows = r as unknown as RowShape[];
      for (const x of r) if (x.key) labelByKey.set(x.key, x.label);
      break;
    }
    case "ad_set": {
      const r = await db
        .select({
          key: leads.adSetId,
          label: adSets.name,
          status: leads.leadStatus,
          n: sql<number>`count(*)::int`,
        })
        .from(leads)
        .innerJoin(adSets, eq(adSets.id, leads.adSetId))
        .where(
          and(
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.adSetId, adSets.name, leads.leadStatus);
      rows = r as unknown as RowShape[];
      for (const x of r) if (x.key) labelByKey.set(x.key, x.label);
      break;
    }
    case "ad": {
      const r = await db
        .select({
          key: leads.adId,
          label: ads.name,
          status: leads.leadStatus,
          n: sql<number>`count(*)::int`,
        })
        .from(leads)
        .innerJoin(ads, eq(ads.id, leads.adId))
        .where(
          and(
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.adId, ads.name, leads.leadStatus);
      rows = r as unknown as RowShape[];
      for (const x of r) if (x.key) labelByKey.set(x.key, x.label);
      break;
    }
    case "loan_type": {
      rows = (await db
        .select({
          key: leads.loanType,
          status: leads.leadStatus,
          n: sql<number>`count(*)::int`,
        })
        .from(leads)
        .where(
          and(
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.loanType, leads.leadStatus)) as unknown as RowShape[];
      for (const x of rows) if (x.key) labelByKey.set(x.key, x.key);
      break;
    }
    case "source_platform": {
      rows = (await db
        .select({
          key: leads.sourcePlatform,
          status: leads.leadStatus,
          n: sql<number>`count(*)::int`,
        })
        .from(leads)
        .where(
          and(
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.sourcePlatform, leads.leadStatus)) as unknown as RowShape[];
      for (const x of rows) if (x.key) labelByKey.set(x.key, x.key);
      break;
    }
    case "website": {
      // The "Website" column from Zoho lands in leads.source_channel.
      rows = (await db
        .select({
          key: leads.sourceChannel,
          status: leads.leadStatus,
          n: sql<number>`count(*)::int`,
        })
        .from(leads)
        .where(
          and(
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end),
            isNotNull(leads.sourceChannel)
          )
        )
        .groupBy(leads.sourceChannel, leads.leadStatus)) as unknown as RowShape[];
      for (const x of rows) if (x.key) labelByKey.set(x.key, x.key);
      break;
    }
    case "agent": {
      // Shared-pool model: credit the CLOSING agent (sales_records.agentId),
      // not leads.assignedAgentId (now null). Counts derive from the agent's
      // sales records (deals touched + their outcomes).
      const r = await db
        .select({
          key: salesRecords.agentId,
          label: users.email,
          status: salesRecords.salesStatus,
          n: sql<number>`count(*)::int`,
        })
        .from(salesRecords)
        .innerJoin(users, eq(users.id, salesRecords.agentId))
        .innerJoin(leads, eq(leads.id, salesRecords.leadId))
        .where(
          and(
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(salesRecords.agentId, users.email, salesRecords.salesStatus);
      rows = r as unknown as RowShape[];
      for (const x of r) if (x.key) labelByKey.set(x.key, x.label);
      break;
    }
  }

  for (const r of rows) {
    if (r.key == null) continue;
    const entry =
      out.get(r.key) ?? { leads: 0, approved: 0, closed: 0, rejected: 0, outcomes: 0 };
    entry.leads += r.n;
    if (r.status === "approved") entry.approved += r.n;
    if (r.status === "closed") entry.closed += r.n;
    if (r.status === "rejected" || r.status === "not_suitable") entry.rejected += r.n;
    if ((OUTCOME_STATUSES as readonly string[]).includes(r.status)) entry.outcomes += r.n;
    out.set(r.key, entry);
  }
  return out;
}

async function revenueByDim(
  dim: Dimension,
  range: DateRange,
  labelByKey: Map<string, string>
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  type Row = { key: string | null; revenue: number };
  let rows: Row[] = [];

  switch (dim) {
    case "platform": {
      rows = (await db
        .select({
          key: adAccounts.platform,
          revenue: sql<number>`coalesce(sum(${salesRecords.revenueValue}), 0)::float`,
        })
        .from(salesRecords)
        .innerJoin(leads, eq(leads.id, salesRecords.leadId))
        .innerJoin(adAccounts, eq(adAccounts.id, leads.adAccountId))
        .where(
          and(
            inArray(salesRecords.salesStatus, CLOSED_LIKE),
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(adAccounts.platform)) as unknown as Row[];
      break;
    }
    case "brand": {
      rows = (await db
        .select({
          key: leads.brandId,
          revenue: sql<number>`coalesce(sum(${salesRecords.revenueValue}), 0)::float`,
        })
        .from(salesRecords)
        .innerJoin(leads, eq(leads.id, salesRecords.leadId))
        .where(
          and(
            inArray(salesRecords.salesStatus, CLOSED_LIKE),
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.brandId)) as unknown as Row[];
      break;
    }
    case "campaign": {
      rows = (await db
        .select({
          key: leads.campaignId,
          revenue: sql<number>`coalesce(sum(${salesRecords.revenueValue}), 0)::float`,
        })
        .from(salesRecords)
        .innerJoin(leads, eq(leads.id, salesRecords.leadId))
        .where(
          and(
            inArray(salesRecords.salesStatus, CLOSED_LIKE),
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.campaignId)) as unknown as Row[];
      break;
    }
    case "ad_set": {
      rows = (await db
        .select({
          key: leads.adSetId,
          revenue: sql<number>`coalesce(sum(${salesRecords.revenueValue}), 0)::float`,
        })
        .from(salesRecords)
        .innerJoin(leads, eq(leads.id, salesRecords.leadId))
        .where(
          and(
            inArray(salesRecords.salesStatus, CLOSED_LIKE),
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.adSetId)) as unknown as Row[];
      break;
    }
    case "ad": {
      rows = (await db
        .select({
          key: leads.adId,
          revenue: sql<number>`coalesce(sum(${salesRecords.revenueValue}), 0)::float`,
        })
        .from(salesRecords)
        .innerJoin(leads, eq(leads.id, salesRecords.leadId))
        .where(
          and(
            inArray(salesRecords.salesStatus, CLOSED_LIKE),
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.adId)) as unknown as Row[];
      break;
    }
    case "loan_type": {
      rows = (await db
        .select({
          key: leads.loanType,
          revenue: sql<number>`coalesce(sum(${salesRecords.revenueValue}), 0)::float`,
        })
        .from(salesRecords)
        .innerJoin(leads, eq(leads.id, salesRecords.leadId))
        .where(
          and(
            inArray(salesRecords.salesStatus, CLOSED_LIKE),
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.loanType)) as unknown as Row[];
      break;
    }
    case "source_platform": {
      rows = (await db
        .select({
          key: leads.sourcePlatform,
          revenue: sql<number>`coalesce(sum(${salesRecords.revenueValue}), 0)::float`,
        })
        .from(salesRecords)
        .innerJoin(leads, eq(leads.id, salesRecords.leadId))
        .where(
          and(
            inArray(salesRecords.salesStatus, CLOSED_LIKE),
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.sourcePlatform)) as unknown as Row[];
      break;
    }
    case "website": {
      rows = (await db
        .select({
          key: leads.sourceChannel,
          revenue: sql<number>`coalesce(sum(${salesRecords.revenueValue}), 0)::float`,
        })
        .from(salesRecords)
        .innerJoin(leads, eq(leads.id, salesRecords.leadId))
        .where(
          and(
            inArray(salesRecords.salesStatus, CLOSED_LIKE),
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(leads.sourceChannel)) as unknown as Row[];
      break;
    }
    case "agent": {
      // Credit the CLOSING agent (sales_records.agentId).
      rows = (await db
        .select({
          key: salesRecords.agentId,
          revenue: sql<number>`coalesce(sum(${salesRecords.revenueValue}), 0)::float`,
        })
        .from(salesRecords)
        .innerJoin(leads, eq(leads.id, salesRecords.leadId))
        .where(
          and(
            inArray(salesRecords.salesStatus, CLOSED_LIKE),
            gte(leads.submittedAt, range.start),
            lt(leads.submittedAt, range.end)
          )
        )
        .groupBy(salesRecords.agentId)) as unknown as Row[];
      break;
    }
  }

  for (const r of rows) {
    if (r.key == null) continue;
    out.set(String(r.key), Number(r.revenue));
  }
  void teams; // type-only import keeper
  return out;
}
