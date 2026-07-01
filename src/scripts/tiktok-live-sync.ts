/**
 * Pull TikTok LIVE session summaries from the managed vendor.
 * Usage: npm run tiktok:sync [-- <days>]   (default 7)
 * Provider is selected by TIKTOK_LIVE_PROVIDER (apify | mock | unset=no-op).
 */
import { syncTikTokLive } from "@/lib/tiktok-live/sync";

async function main() {
  const days = Number(process.argv[2]) || undefined;
  console.log(`Syncing TikTok Live${days ? ` (${days}d)` : ""}…`);
  const out = await syncTikTokLive(days ? { days } : {});
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("tiktok sync failed:", err.message);
  process.exit(1);
});
