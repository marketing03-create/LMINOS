/**
 * Show the Google Ads metrics currently stored in ad_spend (last N days),
 * per day and as totals, to cross-check against the Google Ads UI.
 *   npx tsx --env-file=.env.local src/scripts/gads-verify.ts [days]
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, adSpend, campaigns } from "@/db/schema";

async function main() {
  const days = Number(process.argv[2]) || 14;
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  const rows = await db
    .select({
      date: adSpend.date,
      campaign: campaigns.name,
      impressions: adSpend.impressions,
      clicks: adSpend.clicks,
      spend: adSpend.spend,
      conversions: adSpend.conversions,
    })
    .from(adSpend)
    .innerJoin(adAccounts, eq(adAccounts.id, adSpend.adAccountId))
    .leftJoin(campaigns, eq(campaigns.id, adSpend.campaignId))
    .where(and(eq(adAccounts.platform, "google"), gte(adSpend.date, since)))
    .orderBy(desc(adSpend.date));

  console.log(`\nGoogle Ads metrics in ad_spend since ${since} (${rows.length} rows):\n`);
  console.log("date        impr    clicks   cost(RM)   conv   campaign");
  let i = 0,
    c = 0,
    cost = 0,
    cv = 0;
  for (const r of rows) {
    i += r.impressions;
    c += r.clicks;
    cost += Number(r.spend);
    cv += Number(r.conversions);
    console.log(
      `${r.date}  ${String(r.impressions).padStart(6)}  ${String(r.clicks).padStart(6)}  ${Number(r.spend).toFixed(2).padStart(9)}  ${Number(r.conversions).toFixed(0).padStart(5)}   ${r.campaign ?? ""}`
    );
  }
  console.log("\n--- TOTALS over window ---");
  console.log(`impressions: ${i.toLocaleString()}`);
  console.log(`clicks:      ${c.toLocaleString()}   (CTR ${((c / i) * 100).toFixed(2)}%)`);
  console.log(`cost:        RM ${cost.toFixed(2)}   (avg CPC RM ${(cost / c).toFixed(2)})`);
  console.log(`conversions: ${cv.toFixed(0)}   (platform-reported)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("verify failed:", err.message);
  process.exit(1);
});
