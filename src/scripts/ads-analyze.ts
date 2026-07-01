/**
 * Local verification for the AI Google Ads analyst (Feature L).
 *
 *   npm run ads:analyze -- <accountExternalId | accountUuid> [days]
 *   e.g. npm run ads:analyze -- 5998534374 90
 *
 * Analyzes the account over the trailing window, prints the proposals, and
 * persists them as `pending` (exactly like the dashboard's Analyze button).
 * Requires AI_GATEWAY_API_KEY in .env.local.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, adProposals, websites } from "@/db/schema";
import { analyzeAdAccount } from "@/lib/ai/ads-analyst";
import { rangeFromParams, type RangeChoice } from "@/lib/ads/account-metrics";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const args = process.argv.slice(2);
  const ref = args[0];
  if (!ref) {
    throw new Error(
      "Usage: npm run ads:analyze -- <accountExternalId|accountUuid> [days]"
    );
  }
  const days = Number(args[1] ?? "90");
  const rangeKey = [7, 30, 90].includes(days) ? `${days}d` : "90d";
  const range: RangeChoice["range"] = rangeFromParams({ range: rangeKey }).range;

  // Resolve to the internal account id.
  let accountId = ref;
  if (!UUID.test(ref)) {
    const digits = ref.replace(/\D/g, "");
    const row = await db.query.adAccounts.findFirst({
      where: eq(adAccounts.externalAccountId, digits),
      columns: { id: true, displayName: true },
    });
    if (!row) throw new Error(`No ad account with external id "${ref}".`);
    accountId = row.id;
  }

  console.log(`Analyzing account ${accountId} over the last ${days} days…`);
  const { proposals, modelUsed, account } = await analyzeAdAccount(
    accountId,
    range
  );

  console.log(`\nModel: ${modelUsed}`);
  console.log(`Account: ${account.displayName} (website: ${account.website ?? "—"})`);
  console.log(`Proposals: ${proposals.length}\n`);
  proposals.forEach((p, i) => {
    console.log(
      `${i + 1}. [${p.type} · ${p.riskTier} risk · ${p.confidence}] ${p.target ?? ""}`
    );
    console.log(`   change:    ${p.change}`);
    console.log(`   rationale: ${p.rationale}`);
    console.log(`   impact:    ${p.projectedImpact}\n`);
  });

  if (proposals.length) {
    let websiteId: string | null = null;
    if (account.website) {
      const site = await db.query.websites.findFirst({
        where: eq(websites.slug, account.website),
        columns: { id: true },
      });
      websiteId = site?.id ?? null;
    }
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
    console.log(`Persisted ${proposals.length} pending proposal(s) → /admin/ads-proposals`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
