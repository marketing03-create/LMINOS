import { db } from "@/db/client";
import { adAccounts, keywordMetrics } from "@/db/schema";
import { eq, sql, count } from "drizzle-orm";

async function main() {
  // Get all Google accounts
  const accounts = await db
    .select({
      id: adAccounts.id,
      displayName: adAccounts.displayName,
      externalAccountId: adAccounts.externalAccountId,
    })
    .from(adAccounts)
    .where(eq(adAccounts.platform, "google"));

  console.log(`Total Google Ads accounts: ${accounts.length}`);

  // Get keyword count per account
  const kwCounts = await db
    .select({
      adAccountId: keywordMetrics.adAccountId,
      cnt: count(keywordMetrics.id),
    })
    .from(keywordMetrics)
    .groupBy(keywordMetrics.adAccountId);

  const kwMap = new Map(kwCounts.map(r => [r.adAccountId, Number(r.cnt)]));

  const missing = accounts.filter(a => !kwMap.has(a.id) || kwMap.get(a.id)! === 0);
  const hasData = accounts.filter(a => kwMap.has(a.id) && kwMap.get(a.id)! > 0);

  console.log(`\nACCOUNTS WITH 0 KEYWORDS (${missing.length}):`);
  if (missing.length === 0) {
    console.log("  None — all accounts have keyword data!");
  } else {
    missing.forEach(a => console.log(`  ${a.displayName} (${a.externalAccountId})`));
  }

  console.log(`\nACCOUNTS WITH KEYWORD DATA (${hasData.length}):`);
  hasData.forEach(a => console.log(`  ${a.displayName} (${a.externalAccountId}) — ${kwMap.get(a.id)} rows`));
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
