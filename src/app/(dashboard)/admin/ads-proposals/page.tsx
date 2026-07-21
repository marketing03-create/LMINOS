import {
  AdsProposalsClient,
  type AccountOption,
  type ProposalRow,
  type RecentRow,
} from "./ads-proposals-client";

async function load(): Promise<{
  pending: ProposalRow[];
  recent: RecentRow[];
  accounts: AccountOption[];
  error: string | null;
}> {
  try {
    const { db } = await import("@/db/client");
    const { adProposals, adAccounts } = await import("@/db/schema");
    const { and, asc, desc, eq, inArray } = await import("drizzle-orm");

    const accounts = await db
      .select({
        id: adAccounts.id,
        displayName: adAccounts.displayName,
        externalAccountId: adAccounts.externalAccountId,
      })
      .from(adAccounts)
      .where(and(eq(adAccounts.platform, "google"), eq(adAccounts.isActive, true)))
      .orderBy(asc(adAccounts.displayName));

    const pending = await db
      .select({
        id: adProposals.id,
        adAccountId: adProposals.adAccountId,
        accountName: adAccounts.displayName,
        type: adProposals.type,
        riskTier: adProposals.riskTier,
        target: adProposals.target,
        change: adProposals.change,
        rationale: adProposals.rationale,
        projectedImpact: adProposals.projectedImpact,
        confidence: adProposals.confidence,
      })
      .from(adProposals)
      .innerJoin(adAccounts, eq(adAccounts.id, adProposals.adAccountId))
      .where(eq(adProposals.status, "pending"))
      // Newest analysis first, so the account you just analyzed lands on top
      // (not buried alphabetically).
      .orderBy(desc(adProposals.createdAt));

    const recent = await db
      .select({
        id: adProposals.id,
        accountName: adAccounts.displayName,
        type: adProposals.type,
        status: adProposals.status,
        target: adProposals.target,
        change: adProposals.change,
      })
      .from(adProposals)
      .innerJoin(adAccounts, eq(adAccounts.id, adProposals.adAccountId))
      .where(inArray(adProposals.status, ["approved", "rejected", "applied", "failed"]))
      .orderBy(desc(adProposals.reviewedAt))
      .limit(12);

    return {
      pending: pending as ProposalRow[],
      recent: recent as RecentRow[],
      accounts,
      error: null,
    };
  } catch (err) {
    return {
      pending: [],
      recent: [],
      accounts: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function AdsProposalsPage() {
  const { pending, recent, accounts, error } = await load();
  const aiConfigured = !!process.env.AI_GATEWAY_API_KEY;

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Ads Proposals</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Claude reads an account&apos;s real performance data and proposes
          data-grounded changes — negative keywords, pauses, budget tweaks. You
          approve or reject each one. Nothing is sent to Google automatically; a
          human decides every change.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      <AdsProposalsClient
        pending={pending}
        recent={recent}
        accounts={accounts}
        aiConfigured={aiConfigured}
      />
    </div>
  );
}
