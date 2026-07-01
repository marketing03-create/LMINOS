/**
 * One-time backfill for the websites hub:
 *  1. Create a `websites` row per distinct slug (ad_accounts.website ∪ leads.source_channel).
 *  2. Link ad_accounts.website_id by slug.
 *  3. Seed website_agents from agents who already closed sales / were assigned
 *     leads for that website (best-effort initial pool).
 * Idempotent — safe to re-run.  Usage: npm run backfill:websites
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  adAccounts,
  brands,
  leads,
  salesRecords,
  websiteAgents,
  websites,
} from "@/db/schema";

function humanize(slug: string): string {
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  // 1. distinct slugs
  const fromAccts = await db
    .selectDistinct({ s: adAccounts.website })
    .from(adAccounts)
    .where(isNotNull(adAccounts.website));
  const fromLeads = await db
    .selectDistinct({ s: leads.sourceChannel })
    .from(leads)
    .where(isNotNull(leads.sourceChannel));
  const slugs = new Set<string>();
  for (const r of [...fromAccts, ...fromLeads]) {
    const v = (r.s ?? "").trim();
    if (v) slugs.add(v);
  }

  const defBrand = await db.query.brands.findFirst({
    where: eq(brands.slug, "default"),
    columns: { id: true },
  });

  // 2. create website rows
  let created = 0;
  const slugToId = new Map<string, string>();
  for (const slug of slugs) {
    const existing = await db.query.websites.findFirst({
      where: eq(websites.slug, slug),
      columns: { id: true },
    });
    if (existing) {
      slugToId.set(slug, existing.id);
      continue;
    }
    const [row] = await db
      .insert(websites)
      .values({ slug, name: humanize(slug), brandId: defBrand?.id ?? null })
      .returning({ id: websites.id });
    slugToId.set(slug, row.id);
    created++;
  }

  // 3. link ad_accounts.website_id
  let linked = 0;
  const accts = await db
    .select({ id: adAccounts.id, website: adAccounts.website })
    .from(adAccounts)
    .where(isNotNull(adAccounts.website));
  for (const a of accts) {
    const wid = a.website ? slugToId.get(a.website.trim()) : undefined;
    if (wid) {
      await db.update(adAccounts).set({ websiteId: wid }).where(eq(adAccounts.id, a.id));
      linked++;
    }
  }

  // 4. seed agent pools (from sales closers + existing lead assignments)
  let pooled = 0;
  for (const [slug, wid] of slugToId) {
    const closers = await db
      .selectDistinct({ agentId: salesRecords.agentId })
      .from(salesRecords)
      .innerJoin(leads, eq(leads.id, salesRecords.leadId))
      .where(and(eq(leads.sourceChannel, slug), isNotNull(salesRecords.agentId)));
    const assigned = await db
      .selectDistinct({ agentId: leads.assignedAgentId })
      .from(leads)
      .where(and(eq(leads.sourceChannel, slug), isNotNull(leads.assignedAgentId)));
    const ids = new Set<string>();
    for (const x of [...closers, ...assigned]) if (x.agentId) ids.add(x.agentId);
    for (const userId of ids) {
      await db
        .insert(websiteAgents)
        .values({ websiteId: wid, userId })
        .onConflictDoNothing();
      pooled++;
    }
  }

  console.log(
    JSON.stringify(
      {
        distinctSlugs: slugs.size,
        websitesCreated: created,
        accountsLinked: linked,
        agentPoolLinks: pooled,
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("backfill failed:", err.message);
  process.exit(1);
});
