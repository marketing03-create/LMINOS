/**
 * Run a Google Ads metrics sync from the CLI.
 * Usage: npm run gads:sync [-- <days>]   (default 14-day trailing window)
 */
import { syncGoogleAdsMetrics } from "@/lib/google-ads/sync";

async function main() {
  const days = Number(process.argv[2]) || undefined;
  console.log(`Syncing Google Ads metrics${days ? ` (${days}d)` : ""}…`);
  const out = await syncGoogleAdsMetrics(days ? { days } : {});
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("sync failed:", err.message);
  process.exit(1);
});
