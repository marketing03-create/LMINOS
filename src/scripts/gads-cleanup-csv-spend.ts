/**
 * Remove stale CSV-imported ad_spend for Google accounts. The old CSV importer
 * keyed campaigns by NAME (non-numeric external id) and spread a period cost
 * evenly with no metrics; the API sync keys by the real numeric campaign id and
 * stores true daily metrics. Those two coexist and double-count, so we drop the
 * CSV-created campaigns (non-numeric external id) and their spend.
 *
 *   npx tsx --env-file=.env.local src/scripts/gads-cleanup-csv-spend.ts          (dry run)
 *   npx tsx --env-file=.env.local src/scripts/gads-cleanup-csv-spend.ts --apply  (delete)
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, adSpend, campaigns } from "@/db/schema";

async function main() {
  const apply = process.argv.includes("--apply");

  const googleAccts = await db
    .select({ id: adAccounts.id })
    .from(adAccounts)
    .where(eq(adAccounts.platform, "google"));
  const acctIds = googleAccts.map((a) => a.id);
  if (acctIds.length === 0) {
    console.log("no google ad accounts");
    process.exit(0);
  }

  // CSV-created campaigns = external id is not all digits.
  const csvCampaigns = await db
    .select({
      id: campaigns.id,
      ext: campaigns.externalCampaignId,
      name: campaigns.name,
    })
    .from(campaigns)
    .where(
      and(
        inArray(campaigns.adAccountId, acctIds),
        sql`${campaigns.externalCampaignId} !~ '^[0-9]+$'`
      )
    );

  if (csvCampaigns.length === 0) {
    console.log("✓ no stale CSV campaigns found — nothing to clean.");
    process.exit(0);
  }

  const ids = csvCampaigns.map((c) => c.id);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adSpend)
    .where(inArray(adSpend.campaignId, ids));

  console.log(`Found ${csvCampaigns.length} CSV-created campaign(s) with ${n} ad_spend rows:`);
  for (const c of csvCampaigns) console.log(`  - "${c.name}"  (external id: ${c.ext})`);

  if (!apply) {
    console.log("\nDRY RUN — re-run with --apply to delete these.");
    process.exit(0);
  }

  await db.delete(adSpend).where(inArray(adSpend.campaignId, ids));
  await db.delete(campaigns).where(inArray(campaigns.id, ids));
  console.log(`\n✓ Deleted ${n} ad_spend rows and ${ids.length} campaign(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("cleanup failed:", err.message);
  process.exit(1);
});
