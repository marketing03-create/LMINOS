/**
 * One-off: create the private Supabase Storage bucket for TikTok LIVE screenshot
 * uploads (Feature U2). Idempotent. Run once against the shared project (covers
 * local + prod, same Supabase project):
 *   npx tsx --env-file=.env.local src/scripts/ensure-screenshot-bucket.ts
 */
import {
  ensureScreenshotBucket,
  SCREENSHOT_BUCKET,
} from "@/lib/tiktok-live/screenshot-store";

async function main() {
  await ensureScreenshotBucket();
  console.log(`✓ bucket ready: ${SCREENSHOT_BUCKET} (private)`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
