import {
  AdsBlueprintsClient,
  type BlueprintRow,
  type WebsiteOpt,
} from "./ads-blueprints-client";

async function load(): Promise<{
  blueprints: BlueprintRow[];
  websites: WebsiteOpt[];
  error: string | null;
}> {
  try {
    const { db } = await import("@/db/client");
    const { adBlueprints, websites } = await import("@/db/schema");
    const { desc, eq } = await import("drizzle-orm");
    const { websiteOptions } = await import("@/lib/ads/website-metrics");

    const sites = await websiteOptions();

    const rows = await db
      .select({
        id: adBlueprints.id,
        title: adBlueprints.title,
        status: adBlueprints.status,
        riskTier: adBlueprints.riskTier,
        dailyBudgetMyr: adBlueprints.dailyBudgetMyr,
        validatedAt: adBlueprints.validatedAt,
        builtAt: adBlueprints.builtAt,
        error: adBlueprints.error,
        adAccountId: adBlueprints.adAccountId,
        externalCustomerId: adBlueprints.externalCustomerId,
        blueprint: adBlueprints.blueprint,
        websiteName: websites.name,
        createdAt: adBlueprints.createdAt,
      })
      .from(adBlueprints)
      .leftJoin(websites, eq(websites.id, adBlueprints.websiteId))
      .orderBy(desc(adBlueprints.createdAt))
      .limit(25);

    const blueprints: BlueprintRow[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      riskTier: r.riskTier,
      dailyBudgetMyr: r.dailyBudgetMyr ? Number(r.dailyBudgetMyr) : null,
      validatedAt: r.validatedAt ? r.validatedAt.toISOString() : null,
      builtAt: r.builtAt ? r.builtAt.toISOString() : null,
      error: r.error,
      hasAccount: !!r.adAccountId,
      externalCustomerId: r.externalCustomerId,
      websiteName: r.websiteName ?? "—",
      blueprint: r.blueprint as BlueprintRow["blueprint"],
    }));

    return { blueprints, websites: sites, error: null };
  } catch (err) {
    return {
      blueprints: [],
      websites: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function AdsBlueprintsPage() {
  const { blueprints, websites, error } = await load();
  const aiConfigured = !!process.env.AI_GATEWAY_API_KEY;
  const liveEnabled = process.env.ADS_AUTOMATION_ENABLED === "true";
  const budgetCap = process.env.ADS_DAILY_BUDGET_CAP_MYR
    ? Number(process.env.ADS_DAILY_BUDGET_CAP_MYR)
    : null;

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Account Builder</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Claude drafts a complete, launch-ready Google Ads account from your own
          proven data (winning keywords, wasted-term negatives, best hours). You
          review and edit it, approve it, dry-run it against Google for free, and
          build it — every campaign starts <b>PAUSED</b>, so building never
          spends. A human approves every money step.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      <AdsBlueprintsClient
        blueprints={blueprints}
        websites={websites}
        aiConfigured={aiConfigured}
        liveEnabled={liveEnabled}
        budgetCap={budgetCap}
      />
    </div>
  );
}
