/**
 * Run a Zoho → LMIROS sync from the CLI.
 * Usage: npm run zoho:sync
 */
import { syncZoho } from "@/lib/zoho/sync";

async function main() {
  console.log("Syncing Zoho…");
  const out = await syncZoho();
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("sync failed:", err.message);
  process.exit(1);
});
