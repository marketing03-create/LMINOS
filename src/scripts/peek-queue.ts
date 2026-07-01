/**
 * Peek at BullMQ queue state. Dev-only diagnostic.
 */
import { Queue } from "bullmq";
import { getRedis } from "@/lib/queue/connection";
import { QUEUE_NAMES } from "@/lib/queue/queues";

async function main() {
  const conn = getRedis();
  for (const name of Object.values(QUEUE_NAMES)) {
    const q = new Queue(name, { connection: conn });
    const counts = await q.getJobCounts();
    console.log(name.padEnd(20), JSON.stringify(counts));
    if (counts.waiting > 0 || counts.failed > 0) {
      const waiting = await q.getWaiting(0, 5);
      const failed = await q.getFailed(0, 5);
      for (const j of waiting) console.log("  WAITING:", j.id, j.data);
      for (const j of failed)
        console.log("  FAILED:", j.id, "→", j.failedReason);
    }
    await q.close();
  }
  await conn.quit();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
