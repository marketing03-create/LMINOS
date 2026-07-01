/**
 * Connectivity check: pings Redis and counts core tables in Postgres.
 * Run: npm run ping
 */
import { sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { db } from "@/db/client";
import {
  brands,
  leads,
  rejectedLeads,
  routingRules,
  salesRecords,
  teams,
  users,
} from "@/db/schema";

async function main() {
  // 1. Redis ping
  const redis = new Redis(process.env.REDIS_URL!);
  const pong = await redis.ping();
  console.log(`Redis  ${pong === "PONG" ? "✓" : "✗"} ${pong}`);
  await redis.quit();

  // 2. Postgres counts
  const checks = [
    ["brands", brands],
    ["teams", teams],
    ["users", users],
    ["routing_rules", routingRules],
    ["leads", leads],
    ["sales_records", salesRecords],
    ["rejected_leads", rejectedLeads],
  ] as const;

  for (const [label, table] of checks) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(table);
    console.log(`${label.padEnd(15)} ${String(row.n).padStart(6)}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL →", err.message);
  process.exit(1);
});
