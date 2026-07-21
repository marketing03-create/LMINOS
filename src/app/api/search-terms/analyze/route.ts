import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { analyzeSearchTerms } from "@/lib/ai/search-terms-analyzer";
import { rangeFromParams } from "@/lib/ads/account-metrics";

// The Claude call (batched over up to a few hundred terms) can take a while.
export const maxDuration = 300;

/**
 * Run the AI Search Terms Analyzer on one Google Ads account (optionally one
 * campaign) over a range. Admin auth. Read-only to Google — verdicts land in
 * `search_term_analyses` as PENDING_REVIEW for a human to review/approve.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    adAccountId?: string;
    campaignExternalId?: string | null;
    range?: string;
    start?: string;
    end?: string;
    reanalyse?: boolean;
  } | null;
  if (!body?.adAccountId) {
    return NextResponse.json(
      { ok: false, error: "adAccountId required" },
      { status: 400 }
    );
  }

  // Search-term analysis wants a broad sample, so it defaults to ALL-TIME
  // (independent of the dashboard's 7-day default).
  const choice = rangeFromParams({
    range: body.range ?? "all",
    start: body.start,
    end: body.end,
  });

  try {
    const result = await analyzeSearchTerms({
      accountId: body.adAccountId,
      campaignExternalId: body.campaignExternalId ?? null,
      range: choice.range,
      reanalyse: body.reanalyse === true,
    });

    await writeAudit({
      actorUserId: auth.userId,
      eventType: "search_terms.analyzed",
      entityType: "ad_account",
      entityId: result.account.id,
      after: {
        analysed: result.analysed,
        skipped: result.skipped,
        errors: result.errors,
        modelUsed: result.modelUsed,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
