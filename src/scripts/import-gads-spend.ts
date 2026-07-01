/**
 * Import a Google Ads "Campaign report" CSV into ad_spend.
 *
 * The native Google Ads export looks like:
 *   line 1: "Campaign report"
 *   line 2: "6 May 2026 - 2 June 2026"          ← the period
 *   line 3: header row (…,Campaign,…,Cost,…)
 *   line 4+: one row per campaign
 *   trailing "Total: …" rows                     ← skipped
 *
 * Cost is a PERIOD total (no daily segmentation), so we spread each campaign's
 * cost evenly across the period's days as daily ad_spend rows — that way any
 * date-range ROAS view picks up the right proportion.
 *
 * Usage:
 *   npm run import:gads-spend -- "<csvPath>" <accountExternalId>
 *
 * The ad account (and its website tag) must already exist
 * (npm run seed:ad-account). Re-running is idempotent (upsert on
 * ad_account+campaign+date).
 */
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, adSpend, campaigns } from "@/db/schema";

function parsePeriod(line: string): { start: Date; end: Date } | null {
  // "6 May 2026 - 2 June 2026"
  const m = line.split(" - ");
  if (m.length !== 2) return null;
  const start = new Date(m[0].trim());
  const end = new Date(m[1].trim());
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

function eachDay(start: Date, end: Date): string[] {
  const days: string[] = [];
  const d = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (d.getTime() <= last) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

async function main() {
  const [csvPath, accountExternalId] = process.argv.slice(2);
  if (!csvPath || !accountExternalId) {
    console.error(
      'usage: import:gads-spend -- "<csvPath>" <accountExternalId>'
    );
    process.exit(1);
  }

  const acct = await db.query.adAccounts.findFirst({
    where: and(
      eq(adAccounts.platform, "google"),
      eq(adAccounts.externalAccountId, accountExternalId)
    ),
    columns: { id: true, website: true },
  });
  if (!acct) {
    console.error(
      `ad account google:${accountExternalId} not found — run npm run seed:ad-account first`
    );
    process.exit(1);
  }

  const raw = readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const period = parsePeriod(lines[1] ?? "");
  if (!period) {
    console.error(`could not parse period from line 2: "${lines[1]}"`);
    process.exit(1);
  }
  const days = eachDay(period.start, period.end);

  // Re-join from the header row (line 3) onward for papaparse.
  const body = lines.slice(2).join("\n");
  const parsed = Papa.parse<Record<string, string>>(body, {
    header: true,
    skipEmptyLines: "greedy",
  });

  let campaignsSeen = 0;
  let spendRows = 0;
  let totalCost = 0;

  for (const row of parsed.data) {
    const name = (row["Campaign"] ?? "").trim();
    const status = (row["Campaign status"] ?? "").trim();
    // Skip the trailing "Total: …" summary rows (the "Total:" prefix lives in
    // the Campaign-status column; those rows have Campaign = "" or "--").
    if (status.startsWith("Total:")) continue;
    if (!name || name === "--" || name === "—") continue;
    const cost = Number((row["Cost"] ?? "0").replace(/[^0-9.\-]/g, ""));
    if (!Number.isFinite(cost) || cost <= 0) continue;

    campaignsSeen++;
    totalCost += cost;

    // Ensure campaign row (external id = the campaign name, stable enough here).
    const existing = await db.query.campaigns.findFirst({
      where: and(
        eq(campaigns.adAccountId, acct.id),
        eq(campaigns.externalCampaignId, name)
      ),
      columns: { id: true },
    });
    let campaignId: string;
    if (existing) {
      campaignId = existing.id;
    } else {
      const [c] = await db
        .insert(campaigns)
        .values({
          adAccountId: acct.id,
          externalCampaignId: name,
          name,
          objective: "search",
          status: "enabled",
        })
        .returning({ id: campaigns.id });
      campaignId = c.id;
    }

    // Spread the period cost evenly across days.
    const perDay = cost / days.length;
    const rows = days.map((date) => ({
      adAccountId: acct.id,
      campaignId,
      date,
      spend: perDay.toFixed(2),
    }));

    for (const r of rows) {
      await db
        .insert(adSpend)
        .values(r)
        .onConflictDoUpdate({
          target: [
            adSpend.adAccountId,
            adSpend.campaignId,
            adSpend.adSetId,
            adSpend.adId,
            adSpend.date,
          ],
          set: { spend: sql`excluded.spend`, updatedAt: sql`now()` },
        });
      spendRows++;
    }
  }

  console.log(
    `Imported ${campaignsSeen} campaign(s), ${spendRows} daily spend rows, total RM ${totalCost.toFixed(2)} across ${days.length} days (${days[0]} → ${days[days.length - 1]}) → website "${acct.website}"`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
