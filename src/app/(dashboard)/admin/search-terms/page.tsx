import {
  SearchTermsClient,
  type AccountOption,
  type AnalysisRow,
  type CampaignOption,
  type SettingsShape,
} from "./search-terms-client";

async function load(accountId: string | null): Promise<{
  accounts: AccountOption[];
  campaigns: CampaignOption[];
  rows: AnalysisRow[];
  settings: SettingsShape | null;
  error: string | null;
}> {
  try {
    const { db } = await import("@/db/client");
    const { adAccounts, searchTermAnalyses } = await import("@/db/schema");
    const { and, asc, desc, eq } = await import("drizzle-orm");
    const { searchTermCampaigns } = await import("@/lib/ads/search-terms-query");
    const { getSettingsRow, rowToSettings } = await import(
      "@/lib/ads/analysis-settings"
    );

    const accounts = await db
      .select({
        id: adAccounts.id,
        displayName: adAccounts.displayName,
        externalAccountId: adAccounts.externalAccountId,
      })
      .from(adAccounts)
      .where(and(eq(adAccounts.platform, "google"), eq(adAccounts.isActive, true)))
      .orderBy(asc(adAccounts.displayName));

    const selected = accountId ?? accounts[0]?.id ?? null;
    if (!selected) {
      return { accounts, campaigns: [], rows: [], settings: null, error: null };
    }

    const [campaigns, rawRows, settingsRow] = await Promise.all([
      searchTermCampaigns(selected),
      db
        .select()
        .from(searchTermAnalyses)
        .where(eq(searchTermAnalyses.adAccountId, selected))
        .orderBy(desc(searchTermAnalyses.createdAt))
        .limit(1000),
      getSettingsRow(selected, ""),
    ]);

    const rows: AnalysisRow[] = rawRows.map((r) => {
      const m = (r.metricsSnapshot ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        campaignExternalId: r.campaignExternalId,
        campaignName: r.campaignName,
        term: r.term,
        decision: r.decision,
        reviewStatus: r.reviewStatus,
        recommendationType: r.recommendationType,
        intentCategory: r.intentCategory,
        commercialIntent: r.commercialIntent,
        relevanceScore: r.relevanceScore,
        confidenceScore: r.confidenceScore,
        riskLevel: r.riskLevel,
        language: r.language,
        reason: r.reason,
        riskExplanation: r.riskExplanation,
        ruleApplied: r.ruleApplied,
        overlapWarning: r.overlapWarning,
        needsHumanReview: r.needsHumanReview,
        suggestedNegativeKeyword: r.suggestedNegativeKeyword,
        suggestedMatchType: r.suggestedMatchType,
        suggestedLevel: r.suggestedLevel,
        editedNegativeKeyword: r.editedNegativeKeyword,
        editedMatchType: r.editedMatchType,
        editedLevel: r.editedLevel,
        notes: r.notes,
        spend: typeof m.spend === "number" ? m.spend : null,
        clicks: typeof m.clicks === "number" ? m.clicks : null,
        conversions: typeof m.conversions === "number" ? m.conversions : null,
        costPerConv: typeof m.costPerConv === "number" ? m.costPerConv : null,
      };
    });

    const settings = settingsRow
      ? toSettingsShape(rowToSettings(settingsRow))
      : null;

    return { accounts, campaigns, rows, settings, error: null };
  } catch (err) {
    return {
      accounts: [],
      campaigns: [],
      rows: [],
      settings: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function toSettingsShape(
  s: Awaited<
    ReturnType<typeof import("@/lib/ads/analysis-settings").rowToSettings>
  >
): SettingsShape {
  return {
    competitorStrategy: s.competitorStrategy,
    brandNames: s.brandNames.join(", "),
    servicesNotOffered: s.servicesNotOffered.join(", "),
    supportedLocations: s.supportedLocations.join(", "),
    unsupportedLocations: s.unsupportedLocations.join(", "),
    minClicksBeforeExclude: s.minClicksBeforeExclude,
    minCostBeforeExcludeMyr: s.minCostBeforeExcludeMyr,
  };
}

export default async function SearchTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const sp = await searchParams;
  const { accounts, campaigns, rows, settings, error } = await load(
    sp.account ?? null
  );
  const aiConfigured = !!process.env.AI_GATEWAY_API_KEY;
  const writeEnabled = process.env.ADS_AUTOMATION_ENABLED === "true";
  const selectedAccountId = sp.account ?? accounts[0]?.id ?? "";

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Search Terms AI</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Claude reads each account&apos;s real Google search terms and classifies
          them <b>KEEP / MONITOR / EXCLUDE</b>, recommending negative keywords like
          an experienced Malaysian loan marketer. You review, edit and approve —
          nothing is added to Google automatically.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      <SearchTermsClient
        accounts={accounts}
        campaigns={campaigns}
        rows={rows}
        settings={settings}
        selectedAccountId={selectedAccountId}
        aiConfigured={aiConfigured}
        writeEnabled={writeEnabled}
      />
    </div>
  );
}
