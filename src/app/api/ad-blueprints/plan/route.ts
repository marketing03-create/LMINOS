import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, adBlueprints } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { rangeFromParams } from "@/lib/ads/account-metrics";
import { websiteById } from "@/lib/ads/website-metrics";
import { budgetCapMyrPerDay, planAccountBlueprint } from "@/lib/ai/ads-planner";
import { clampBudgets, summarizeBlueprint } from "@/lib/ai/ads-planner-core";
import { materializeSteps } from "@/lib/google-ads/build-runner";

// The Claude call can take tens of seconds; allow the max.
export const maxDuration = 300;

/**
 * Draft a launch-ready Google Ads account blueprint for one website (Feature R).
 * Admin auth. Read-only to Google — the blueprint + its build steps land in our
 * DB for a human to review, edit, validate (dry-run), and (once Basic write
 * access is on) build.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    websiteId?: string;
    destinationUrl?: string;
    range?: string;
  } | null;
  if (!body?.websiteId) {
    return NextResponse.json({ ok: false, error: "websiteId required" }, { status: 400 });
  }
  const destinationUrl = (body.destinationUrl ?? "").trim();
  if (!/^https?:\/\/.+/i.test(destinationUrl)) {
    return NextResponse.json(
      { ok: false, error: "A valid landing-page URL (https://…) is required." },
      { status: 400 }
    );
  }

  const site = await websiteById(body.websiteId);
  if (!site) {
    return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404 });
  }

  // Proven-data window defaults to all-time for the best keyword sample.
  const choice = rangeFromParams({ range: body.range ?? "all" });

  try {
    const { blueprint: raw, modelUsed } = await planAccountBlueprint({
      websiteSlug: site.slug,
      websiteName: site.name,
      destinationUrl,
      range: choice.range,
    });
    const blueprint = clampBudgets(raw, budgetCapMyrPerDay());
    const summary = summarizeBlueprint(blueprint);

    // Link the website's active Google account, if it has one (build target).
    const acct = await db.query.adAccounts.findFirst({
      where: and(
        eq(adAccounts.platform, "google"),
        eq(adAccounts.isActive, true),
        sql`(${adAccounts.websiteId} = ${site.id} or ${adAccounts.website} = ${site.slug})`
      ),
      columns: { id: true, externalAccountId: true },
    });

    const [row] = await db
      .insert(adBlueprints)
      .values({
        adAccountId: acct?.id ?? null,
        websiteId: site.id,
        accountSource: "existing",
        status: "draft",
        riskTier: "high",
        title: blueprint.accountName,
        blueprint,
        dailyBudgetMyr: String(summary.totalDailyBudgetMyr),
        rationale: blueprint.assumptions ?? null,
        modelUsed,
        externalCustomerId: acct?.externalAccountId ?? null,
      })
      .returning({ id: adBlueprints.id });

    const stepCount = await materializeSteps(
      row.id,
      blueprint,
      acct?.externalAccountId ?? ""
    );

    await writeAudit({
      actorUserId: auth.userId,
      eventType: "ads_blueprint.planned",
      entityType: "ad_blueprint",
      entityId: row.id,
      after: { website: site.slug, modelUsed, steps: stepCount, ...summary },
    });

    return NextResponse.json({ ok: true, id: row.id, ...summary, steps: stepCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("not configured") ? 503 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
