/**
 * Pull Google Ads keyword + search-term performance from the CLI.
 * Usage: npm run gads:sync-keywords [-- <days>]   (default 30)
 */
import { syncGoogleAdsKeywords } from "@/lib/google-ads/sync-keywords";

async function main() {
  const days = Number(process.argv[2]) || undefined;
  console.log(`Syncing Google Ads keywords${days ? ` (${days}d)` : ""}…`);
  const out = await syncGoogleAdsKeywords(days ? { days } : {});
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("keyword sync failed:", err.message);
  process.exit(1);
});
