/**
 * Pull Google Ads hour-of-day performance from the CLI.
 * Usage: npm run gads:sync-hourly [-- <days>]   (default 90)
 */
import { syncGoogleAdsHourly } from "@/lib/google-ads/sync-hourly";

async function main() {
  const days = Number(process.argv[2]) || undefined;
  console.log(`Syncing Google Ads hourly metrics${days ? ` (${days}d)` : ""}…`);
  const out = await syncGoogleAdsHourly(days ? { days } : {});
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("hourly sync failed:", err.message);
  process.exit(1);
});
