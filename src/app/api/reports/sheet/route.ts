import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reportLinks } from "@/db/schema";
import { handleDailyReport } from "@/lib/reports/daily";
import { reportCsv } from "@/lib/reports/daily-core";

/**
 * A TikTok handle's daily report as CSV, for a Google Sheet's
 * =IMPORTDATA("…/api/reports/sheet?key=…"). Google fetches it without a login
 * (proxy.ts lists /api/reports as public), so the key is the only check: an
 * unknown or replaced key gets 404 and nothing else. Daily totals only — no
 * customer names or phone numbers.
 */
const KEY_RE = /^[A-Za-z0-9_-]{32,100}$/;

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (!KEY_RE.test(key)) return new NextResponse("not found", { status: 404 });

  const [link] = await db.select().from(reportLinks).where(eq(reportLinks.key, key)).limit(1);
  if (!link) return new NextResponse("not found", { status: 404 });

  const rows = await handleDailyReport(link.accountId);
  // Best-effort: shows on Integrations when the Sheet last pulled it.
  await db
    .update(reportLinks)
    .set({ lastFetchedAt: new Date() })
    .where(eq(reportLinks.accountId, link.accountId))
    .catch(() => {});

  return new NextResponse(reportCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
