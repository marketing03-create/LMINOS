import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { campaignAnalysisSettings } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { getSettingsRow } from "@/lib/ads/analysis-settings";

/**
 * Account-wide analysis settings (campaignExternalId = ""): the configurable
 * business rules the Search Terms Analyzer obeys (brand names, competitor
 * strategy, services offered/not, locations, evidence thresholds). Admin auth.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { accountId } = await params;
  const row = await getSettingsRow(accountId, "");
  return NextResponse.json({ ok: true, settings: row });
}

const asArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map((x) => String(x).trim()).filter((x) => x.length > 0)
    : typeof v === "string"
      ? v
          .split(",")
          .map((x) => x.trim())
          .filter((x) => x.length > 0)
      : [];

const asNumericText = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
};

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { accountId } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const strategy = String(body.competitorStrategy ?? "MONITOR");
  const validStrategy = ["EXCLUDE_ALL", "MONITOR", "ALLOW"].includes(strategy)
    ? (strategy as "EXCLUDE_ALL" | "MONITOR" | "ALLOW")
    : "MONITOR";

  const values = {
    adAccountId: accountId,
    campaignExternalId: "",
    servicesOffered: asArray(body.servicesOffered),
    servicesNotOffered: asArray(body.servicesNotOffered),
    supportedLocations: asArray(body.supportedLocations),
    unsupportedLocations: asArray(body.unsupportedLocations),
    brandNames: asArray(body.brandNames),
    productNames: asArray(body.productNames),
    competitorStrategy: validStrategy,
    mobileAppAvailable: body.mobileAppAvailable === true,
    onlineAppAvailable: body.onlineAppAvailable !== false,
    minClicksBeforeExclude: Number.isFinite(Number(body.minClicksBeforeExclude))
      ? Math.max(0, Math.trunc(Number(body.minClicksBeforeExclude)))
      : 5,
    minCostBeforeExcludeMyr: asNumericText(body.minCostBeforeExcludeMyr) ?? "20",
    highSpendThresholdMyr: asNumericText(body.highSpendThresholdMyr),
    targetCostPerLeadMyr: asNumericText(body.targetCostPerLeadMyr),
    updatedAt: new Date(),
  };

  await db
    .insert(campaignAnalysisSettings)
    .values(values)
    .onConflictDoUpdate({
      target: [
        campaignAnalysisSettings.adAccountId,
        campaignAnalysisSettings.campaignExternalId,
      ],
      set: {
        servicesOffered: values.servicesOffered,
        servicesNotOffered: values.servicesNotOffered,
        supportedLocations: values.supportedLocations,
        unsupportedLocations: values.unsupportedLocations,
        brandNames: values.brandNames,
        productNames: values.productNames,
        competitorStrategy: values.competitorStrategy,
        mobileAppAvailable: values.mobileAppAvailable,
        onlineAppAvailable: values.onlineAppAvailable,
        minClicksBeforeExclude: values.minClicksBeforeExclude,
        minCostBeforeExcludeMyr: values.minCostBeforeExcludeMyr,
        highSpendThresholdMyr: values.highSpendThresholdMyr,
        targetCostPerLeadMyr: values.targetCostPerLeadMyr,
        updatedAt: values.updatedAt,
      },
    });

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "search_terms.settings_updated",
    entityType: "ad_account",
    entityId: accountId,
    after: { competitorStrategy: validStrategy, brandNames: values.brandNames },
  });

  return NextResponse.json({ ok: true });
}
