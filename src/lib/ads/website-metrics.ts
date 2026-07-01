/**
 * Website-level rollups for the Websites hub (Feature M). A website is the
 * stable unit: its ad accounts rotate (suspended → replaced) but performance
 * aggregates by the website SLUG (= ad_accounts.website = leads.source_channel),
 * so history is continuous across an account swap.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  adAccounts,
  adSpend,
  leads,
  salesRecords,
  users,
  websiteAgents,
  websites,
} from "@/db/schema";
import type { DateRange } from "@/lib/roas/aggregate";

const CLOSED_LIKE: ("approved" | "closed")[] = ["approved", "closed"];

export type WebsiteSummary = {
  id: string;
  slug: string;
  name: string;
  status: string;
  isActive: boolean;
  whatsappNumber: string | null;
  agentCount: number;
  activeAccounts: number;
  suspendedAccounts: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  leads: number;
  approved: number;
  revenue: number;
  realRoas: number | null;
};

/** All websites with per-website spend/leads/revenue summed over the range. */
export async function websiteSummaries(
  range: DateRange
): Promise<WebsiteSummary[]> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);

  const sites = await db
    .select({
      id: websites.id,
      slug: websites.slug,
      name: websites.name,
      status: websites.status,
      isActive: websites.isActive,
      whatsappNumber: websites.whatsappNumber,
    })
    .from(websites)
    .orderBy(asc(websites.name));

  // Spend + ad stats by account slug (matches the ROAS aggregator).
  const spendRows = await db
    .select({
      slug: adAccounts.website,
      spend: sql<number>`coalesce(sum(${adSpend.spend}),0)::float`,
      impressions: sql<number>`coalesce(sum(${adSpend.impressions}),0)::int`,
      clicks: sql<number>`coalesce(sum(${adSpend.clicks}),0)::int`,
      conversions: sql<number>`coalesce(sum(${adSpend.conversions}),0)::float`,
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
  const spendBySlug = new Map(spendRows.map((r) => [r.slug, r]));

  // Lead counts by slug (= leads.source_channel).
  const leadRows = await db
    .select({
      slug: leads.sourceChannel,
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
    .groupBy(leads.sourceChannel, leads.leadStatus);
  const leadsBySlug = new Map<string, { leads: number; approved: number }>();
  for (const r of leadRows) {
    if (!r.slug) continue;
    const e = leadsBySlug.get(r.slug) ?? { leads: 0, approved: 0 };
    e.leads += r.n;
    if (r.status === "approved" || r.status === "closed") e.approved += r.n;
    leadsBySlug.set(r.slug, e);
  }

  // Revenue by slug.
  const revRows = await db
    .select({
      slug: leads.sourceChannel,
      revenue: sql<number>`coalesce(sum(${salesRecords.revenueValue}),0)::float`,
    })
    .from(salesRecords)
    .innerJoin(leads, eq(leads.id, salesRecords.leadId))
    .where(
      and(
        inArray(salesRecords.salesStatus, CLOSED_LIKE),
        gte(leads.submittedAt, range.start),
        lt(leads.submittedAt, range.end),
        isNotNull(leads.sourceChannel)
      )
    )
    .groupBy(leads.sourceChannel);
  const revBySlug = new Map(revRows.map((r) => [r.slug, Number(r.revenue)]));

  // Agent pool counts by website id.
  const agentRows = await db
    .select({
      websiteId: websiteAgents.websiteId,
      n: sql<number>`count(*)::int`,
    })
    .from(websiteAgents)
    .groupBy(websiteAgents.websiteId);
  const agentsByWebsite = new Map(agentRows.map((r) => [r.websiteId, r.n]));

  // Account counts by slug (active vs suspended/replaced).
  const acctRows = await db
    .select({
      slug: adAccounts.website,
      status: adAccounts.status,
      n: sql<number>`count(*)::int`,
    })
    .from(adAccounts)
    .where(isNotNull(adAccounts.website))
    .groupBy(adAccounts.website, adAccounts.status);
  const acctBySlug = new Map<string, { active: number; suspended: number }>();
  for (const r of acctRows) {
    if (!r.slug) continue;
    const e = acctBySlug.get(r.slug) ?? { active: 0, suspended: 0 };
    if (r.status === "active") e.active += r.n;
    else e.suspended += r.n;
    acctBySlug.set(r.slug, e);
  }

  return sites
    .map((s) => {
      const sp = spendBySlug.get(s.slug);
      const ld = leadsBySlug.get(s.slug) ?? { leads: 0, approved: 0 };
      const spend = Number(sp?.spend ?? 0);
      const revenue = revBySlug.get(s.slug) ?? 0;
      const acct = acctBySlug.get(s.slug) ?? { active: 0, suspended: 0 };
      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        status: s.status,
        isActive: s.isActive,
        whatsappNumber: s.whatsappNumber,
        agentCount: agentsByWebsite.get(s.id) ?? 0,
        activeAccounts: acct.active,
        suspendedAccounts: acct.suspended,
        spend,
        impressions: Number(sp?.impressions ?? 0),
        clicks: Number(sp?.clicks ?? 0),
        conversions: Number(sp?.conversions ?? 0),
        leads: ld.leads,
        approved: ld.approved,
        revenue,
        realRoas: spend > 0 ? revenue / spend : null,
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

export async function websiteById(id: string) {
  return db.query.websites.findFirst({ where: eq(websites.id, id) });
}

export type WebsiteAccountRow = {
  id: string;
  displayName: string;
  externalAccountId: string;
  platform: string;
  status: string;
  isActive: boolean;
  suspendedAt: Date | null;
  lastSyncedAt: Date | null;
  hasToken: boolean;
};

/** Ad accounts attached to a website (by websiteId or matching slug). */
export async function websiteAccounts(
  websiteId: string,
  slug: string
): Promise<WebsiteAccountRow[]> {
  const rows = await db
    .select({
      id: adAccounts.id,
      displayName: adAccounts.displayName,
      externalAccountId: adAccounts.externalAccountId,
      platform: adAccounts.platform,
      status: adAccounts.status,
      isActive: adAccounts.isActive,
      suspendedAt: adAccounts.suspendedAt,
      lastSyncedAt: adAccounts.lastSyncedAt,
      tokenEnc: adAccounts.accessTokenEncrypted,
    })
    .from(adAccounts)
    .where(
      sql`${adAccounts.websiteId} = ${websiteId} or ${adAccounts.website} = ${slug}`
    )
    .orderBy(desc(adAccounts.isActive), asc(adAccounts.displayName));
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    externalAccountId: r.externalAccountId,
    platform: r.platform,
    status: r.status,
    isActive: r.isActive,
    suspendedAt: r.suspendedAt,
    lastSyncedAt: r.lastSyncedAt,
    hasToken: !!r.tokenEnc,
  }));
}

export type AgentRow = {
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
};

/** The agent pool for a website. */
export async function websiteAgentPool(websiteId: string): Promise<AgentRow[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
    })
    .from(websiteAgents)
    .innerJoin(users, eq(users.id, websiteAgents.userId))
    .where(eq(websiteAgents.websiteId, websiteId))
    .orderBy(asc(users.fullName));
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    fullName: r.fullName,
    role: String(r.role),
  }));
}

/** All sales agents (for the "add to pool" picker). */
export async function allSalesAgents(): Promise<AgentRow[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
    })
    .from(users)
    .where(eq(users.role, "sales_agent"))
    .orderBy(asc(users.fullName));
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    fullName: r.fullName,
    role: String(r.role),
  }));
}

/** Minimal website list for dropdowns (id, slug, name). */
export async function websiteOptions(): Promise<
  { id: string; slug: string; name: string }[]
> {
  return db
    .select({ id: websites.id, slug: websites.slug, name: websites.name })
    .from(websites)
    .where(eq(websites.isActive, true))
    .orderBy(asc(websites.name));
}
