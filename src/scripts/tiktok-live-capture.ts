/**
 * Capture a TikTok LIVE from this machine (Phase 1 — laptop).
 *
 *   npm run tiktok:live -- @yourhandle            # capture the current live, then exit
 *   npm run tiktok:live -- @yourhandle --watch    # wait + auto-capture every live (keep open)
 *
 * Writes the session summary + keyword leads straight to the LMIROS database,
 * so it shows up on /tiktok-live. Same captureLive() the Fly worker runs in
 * Phase 2 — nothing here is throwaway.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts } from "@/db/schema";
import { captureLive } from "@/lib/tiktok-live/connector";
import { DEFAULT_KEYWORDS } from "@/lib/tiktok-live/keyword-match";
import { isHandleLive } from "@/lib/tiktok-live/live-status";

const norm = (h: string) => h.replace(/^@+/, "").trim().toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolveAccount(handle: string) {
  const h = norm(handle);
  const found = await db.query.tiktokAccounts.findFirst({
    where: eq(tiktokAccounts.handle, h),
    columns: { id: true, handle: true, leadKeywords: true },
  });
  if (found) return found;
  const [row] = await db
    .insert(tiktokAccounts)
    .values({ handle: h, displayName: h })
    .returning({
      id: tiktokAccounts.id,
      handle: tiktokAccounts.handle,
      leadKeywords: tiktokAccounts.leadKeywords,
    });
  console.log(`registered new handle @${h} (set its keywords on /admin/tiktok)`);
  return row;
}

async function captureOnce(accountId: string, handle: string, maxMs?: number) {
  // Re-read keywords each time so admin edits take effect.
  const acct = await db.query.tiktokAccounts.findFirst({
    where: eq(tiktokAccounts.id, accountId),
    columns: { leadKeywords: true },
  });
  const keywords = acct?.leadKeywords?.length ? acct.leadKeywords : DEFAULT_KEYWORDS;
  return captureLive(handle, {
    accountId,
    keywords,
    maxMs,
    log: (m) => console.log(`  ${m}`),
  });
}

async function main() {
  const args = process.argv.slice(2);
  const watch = args.includes("--watch");
  const handle = args.find((a) => !a.startsWith("--"));
  // Optional `--minutes N` cap → stop + save a partial session (for quick tests).
  const minIdx = args.indexOf("--minutes");
  const maxMs =
    minIdx >= 0 && args[minIdx + 1] ? Math.max(1, Number(args[minIdx + 1])) * 60_000 : undefined;
  if (!handle) {
    console.error("usage: npm run tiktok:live -- <@handle> [--watch] [--minutes N]");
    process.exit(1);
  }

  const acct = await resolveAccount(handle);
  const keywords = acct.leadKeywords?.length ? acct.leadKeywords : DEFAULT_KEYWORDS;
  console.log(`tracking @${acct.handle} · keywords: ${keywords.join(", ")}`);

  if (!watch) {
    const res = await captureOnce(acct.id, acct.handle, maxMs);
    if (!res.live) {
      console.log("Not live right now. Run this when you go live, or use --watch.");
    }
    process.exit(0);
  }

  console.log("watch mode — waiting for lives (Ctrl+C to stop)…");
  // eslint-disable-next-line no-constant-condition
  for (;;) {
    try {
      if (await isHandleLive(acct.handle)) {
        console.log(`@${acct.handle} is LIVE — capturing…`);
        await captureOnce(acct.id, acct.handle, maxMs);
        console.log("…live ended, back to watching.");
      }
    } catch (err) {
      console.error("watch error:", err instanceof Error ? err.message : err);
    }
    await sleep(60_000);
  }
}

main().catch((err) => {
  console.error("capture failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
