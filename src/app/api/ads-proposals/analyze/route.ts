import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adProposals, websites } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { analyzeAdAccount } from "@/lib/ai/ads-analyst";
import { rangeFromParams } from "@/lib/ads/account-metrics";

// The Claude call can take tens of seconds; allow the max.
export const maxDuration = 300;

/**
 * Run the AI analyst on one Google Ads account and store the resulting
 * proposals as `pending`. Admin auth. Read-only to Google — nothing is applied.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    adAccountId?: string;
    range?: string;
    start?: string;
    end?: string;
  } | null;
  if (!body?.adAccountId) {
    return NextResponse.json(
      { ok: false, error: "adAccountId required" },
      { status: 400 }
    );
  }

  // The AI analyst needs a big sample for sound keyword/negative decisions, so
  // it defaults to ALL-TIME (independent of the dashboard's 7-day default).
  const choice = rangeFromParams({
    range: body.range ?? "all",
    start: body.start,
    end: body.end,
  });

  try {
    const { proposals, modelUsed, account } = await analyzeAdAccount(
      body.adAccountId,
      choice.range
    );

    // Best-effort website link for context.
    let websiteId: string | null = null;
    if (account.website) {
      const site = await db.query.websites.findFirst({
        where: eq(websites.slug, account.website),
        columns: { id: true },
      });
      websiteId = site?.id ?? null;
    }

    if (proposals.length) {
      await db.insert(adProposals).values(
        proposals.map((p) => ({
          adAccountId: account.id,
          websiteId,
          type: p.type,
          status: "pending" as const,
          riskTier: p.riskTier,
          target: p.target,
          change: p.change,
          rationale: p.rationale,
          projectedImpact: p.projectedImpact,
          confidence: p.confidence,
          payload: p,
          modelUsed,
        }))
      );
    }

    await writeAudit({
      actorUserId: auth.userId,
      eventType: "ads_proposal.analyzed",
      entityType: "ad_account",
      entityId: account.id,
      after: { count: proposals.length, modelUsed },
    });

    return NextResponse.json({ ok: true, count: proposals.length });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
