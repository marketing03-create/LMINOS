/**
 * Dev-only: wipe processed_jobs so we can re-run a previously-attempted
 * synthetic lead during smoke testing. NEVER run this in production.
 */
import { db } from "@/db/client";
import { processedJobs } from "@/db/schema";

async function main() {
  const r = await db.delete(processedJobs).returning({ key: processedJobs.idempotencyKey });
  console.log(`deleted ${r.length} processed_jobs row(s)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
