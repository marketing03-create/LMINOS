/**
 * End-to-end test for the TikTok Live pipeline using the built-in `mock`
 * provider (no real vendor needed). Registers a test handle, runs the sync,
 * asserts sessions + dashboard queries, checks idempotency, then cleans up.
 *
 *   npm run test:tiktok
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts, tiktokLiveSessions } from "@/db/schema";

const TEST_HANDLE = "lmiros_verify_tt";

function log(...a: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...a);
}

async function sessionCount(accountId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tiktokLiveSessions)
    .where(eq(tiktokLiveSessions.accountId, accountId));
  return Number(r?.n ?? 0);
}

async function main() {
  process.env.TIKTOK_LIVE_PROVIDER = "mock";
  const { syncTikTokLive } = await import("@/lib/tiktok-live/sync");
  const { tiktokLiveKpis, tiktokLiveSessionList, tiktokLiveTrend } = await import(
    "@/lib/tiktok-live/queries"
  );

  let pass = true;
  const range = {
    start: new Date("2025-01-01T00:00:00.000Z"),
    end: new Date(Date.now() + 86_400_000),
  };

  // Clean any leftover, then register a fresh test handle.
  await db.delete(tiktokAccounts).where(eq(tiktokAccounts.handle, TEST_HANDLE));
  const [acct] = await db
    .insert(tiktokAccounts)
    .values({ handle: TEST_HANDLE, displayName: "Verify TT" })
    .returning({ id: tiktokAccounts.id });
  log(`account: @${TEST_HANDLE} (${acct.id})`);

  // 1. Sync via the mock provider.
  const out = await syncTikTokLive({ days: 3650 });
  log(`sync: provider=${out.provider} accounts=${out.accounts} sessions=${out.sessions} errors=${out.errors.length}`);

  const n1 = await sessionCount(acct.id);
  const kpis = await tiktokLiveKpis(range);
  const list = await tiktokLiveSessionList(range);
  const trend = await tiktokLiveTrend(range);
  const mine = list.filter((s) => s.handle === TEST_HANDLE);

  // 2. Idempotency — re-run, count must stay 2.
  await syncTikTokLive({ days: 3650 });
  const n2 = await sessionCount(acct.id);

  const checks: Array<[string, boolean, string]> = [
    ["provider = mock", out.provider === "mock", out.provider],
    ["2 sessions for the handle", n1 === 2, `${n1}`],
    ["idempotent re-sync", n2 === 2, `${n2}`],
    ["kpis count ≥ 2", kpis.sessions >= 2, `${kpis.sessions}`],
    ["kpis likes > 0", kpis.totalLikes > 0, `${kpis.totalLikes}`],
    ["kpis live hours > 0", kpis.liveHours > 0, `${kpis.liveHours}`],
    ["session list has handle", mine.length >= 1, `${mine.length}`],
    ["session peak viewers > 0", (mine[0]?.peakViewers ?? 0) > 0, `${mine[0]?.peakViewers}`],
    ["trend has points", trend.some((t) => t.handle === TEST_HANDLE), `${trend.length}`],
  ];
  log("");
  for (const [name, ok, detail] of checks) {
    log(`  ${ok ? "✓" : "✗"} ${name} (${detail})`);
    if (!ok) pass = false;
  }

  // Cleanup (cascade deletes the sessions).
  await db.delete(tiktokAccounts).where(eq(tiktokAccounts.id, acct.id));
  log("\ncleanup: deleted test handle + sessions");

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
