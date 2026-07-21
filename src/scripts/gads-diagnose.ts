/**
 * Live diagnostic for ONE Google Ads account — "why is my campaign not serving?"
 *
 * Usage: npm run gads:diagnose -- <customerId>
 *
 * Read-only. Pulls Google's own primary_status + reasons (the fields Google
 * built to answer exactly this question), budget vs today's spend, ad-approval
 * status, and today's hour-by-hour delivery so we can see when it stopped.
 */
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts } from "@/db/schema";
import { decryptToken } from "@/lib/crypto/envelope";
import { getGoogleAdsAccessToken, getAccessTokenForRefreshToken } from "@/lib/google-ads/auth";
import { normalizeCustomerId } from "@/lib/google-ads/client";

const API_VERSION = "v23";

async function gaql(
  cid: string,
  query: string,
  opts: { accessToken: string; loginCustomerId?: string }
): Promise<any[]> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN must be set");
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${cid}/googleAds:searchStream`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
    "developer-token": devToken,
    "content-type": "application/json",
  };
  if (opts.loginCustomerId) headers["login-customer-id"] = normalizeCustomerId(opts.loginCustomerId);
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ query: query.trim() }) });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error(`non-JSON HTTP ${res.status}: ${text.slice(0, 300)}`); }
  if (!res.ok) {
    const errObj = Array.isArray(parsed) ? parsed[0] : parsed;
    throw new Error(`HTTP ${res.status}: ${errObj?.error?.message ?? JSON.stringify(parsed).slice(0, 400)}`);
  }
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  const rows: any[] = [];
  for (const b of batches) for (const r of b.results ?? []) rows.push(r);
  return rows;
}

function myrToday(): string {
  // Account timezone is Malaysia (UTC+8). Compute "today" in MYT.
  const now = new Date();
  const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return myt.toISOString().slice(0, 10);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) { console.error("Usage: npm run gads:diagnose -- <customerId>"); process.exit(1); }
  const cid = normalizeCustomerId(arg);
  console.log(`\n=== DIAGNOSING Google Ads account ${cid} ===\n`);

  // 1) Look the account up in LMIROS to get its own token (if any).
  const acct = await db.query.adAccounts.findFirst({
    where: and(eq(adAccounts.platform, "google"), eq(adAccounts.externalAccountId, cid)),
    columns: { id: true, displayName: true, accessTokenEncrypted: true, website: true, status: true, isActive: true },
  });

  let accessToken: string;
  let tokenSource: string;
  if (acct?.accessTokenEncrypted) {
    accessToken = await getAccessTokenForRefreshToken(decryptToken(acct.accessTokenEncrypted));
    tokenSource = `per-account token (${acct.displayName})`;
  } else {
    accessToken = await getGoogleAdsAccessToken();
    tokenSource = "global env token";
  }
  console.log(`In LMIROS: ${acct ? `YES — "${acct.displayName}" (active=${acct.isActive}, status=${acct.status})` : "NO (querying directly)"}`);
  console.log(`Auth: ${tokenSource}\n`);

  const opts = { accessToken };
  const today = myrToday();
  console.log(`Today (MYT): ${today}\n`);

  // 2) Account (customer) level — suspended? disapproved?
  try {
    const cust = await gaql(cid, `
      SELECT customer.id, customer.descriptive_name, customer.status,
             customer.pay_per_conversion_eligibility_failure_reasons
      FROM customer LIMIT 1`, opts);
    const c = cust[0]?.customer;
    console.log(`── ACCOUNT ──`);
    console.log(`  Name: ${c?.descriptiveName}`);
    console.log(`  Status: ${c?.status}   ${c?.status !== "ENABLED" ? "⚠️  ACCOUNT NOT ENABLED" : "✓"}`);
    console.log("");
  } catch (e: any) { console.log(`  ⚠️  Account query failed: ${e.message}\n`); }

  // 3) Campaign level — the KEY diagnostic: primary_status + reasons + budget.
  console.log(`── CAMPAIGNS (Google's own serving diagnosis) ──`);
  try {
    const camps = await gaql(cid, `
      SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status,
             campaign.primary_status, campaign.primary_status_reasons,
             campaign.advertising_channel_type, campaign.bidding_strategy_type,
             campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.name`, opts);
    if (!camps.length) console.log("  (no non-removed campaigns)");
    for (const r of camps) {
      const c = r.campaign, b = r.campaignBudget;
      const budget = b?.amountMicros ? (Number(b.amountMicros) / 1_000_000).toFixed(2) : "?";
      console.log(`\n  ▸ ${c?.name}  [id ${c?.id}]`);
      console.log(`    status=${c?.status}  serving=${c?.servingStatus}  channel=${c?.advertisingChannelType}  bidding=${c?.biddingStrategyType}`);
      console.log(`    PRIMARY STATUS: ${c?.primaryStatus}`);
      if (c?.primaryStatusReasons?.length) console.log(`    REASONS: ${c.primaryStatusReasons.join(", ")}   ⚠️`);
      console.log(`    daily budget: RM ${budget}`);
    }
  } catch (e: any) { console.log(`  ⚠️  Campaign query failed: ${e.message}`); }
  console.log("");

  // 3b) Recent delivery history — has it EVER served?
  console.log(`── LAST 14 DAYS (has it ever served?) ──`);
  try {
    const daily = await gaql(cid, `
      SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros
      FROM campaign WHERE segments.date DURING LAST_14_DAYS ORDER BY segments.date`, opts);
    const served = daily.filter((r) => Number(r.metrics?.impressions ?? 0) > 0);
    if (!served.length) console.log("  ⚠️  ZERO impressions in 14 days — the campaign has NEVER served.");
    for (const r of served) console.log(`  ${r.segments?.date}: ${r.metrics?.impressions} impr · ${r.metrics?.clicks} clk`);
  } catch (e: any) { console.log(`  ⚠️  History query failed: ${e.message}`); }
  console.log("");

  // 3c) Keyword bids + serving status — the usual "eligible but 0 impressions" cause.
  console.log(`── KEYWORDS (bid · quality · serving) ──`);
  try {
    const kws = await gaql(cid, `
      SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
             ad_group_criterion.status, ad_group_criterion.effective_cpc_bid_micros,
             ad_group_criterion.quality_info.quality_score,
             ad_group_criterion.system_serving_status
      FROM keyword_view WHERE ad_group_criterion.status != 'REMOVED'`, opts);
    if (!kws.length) console.log("  ⚠️  NO KEYWORDS — a search campaign with no keywords cannot serve.");
    for (const r of kws) {
      const c = r.adGroupCriterion;
      const bid = c?.effectiveCpcBidMicros ? `RM ${(Number(c.effectiveCpcBidMicros) / 1e6).toFixed(2)}` : "(no bid)";
      const flag = c?.systemServingStatus && c.systemServingStatus !== "ELIGIBLE" ? "⚠️" : "";
      console.log(`  ${flag} "${c?.keyword?.text}" [${c?.keyword?.matchType}] bid=${bid} QS=${c?.qualityInfo?.qualityScore ?? "—"} serving=${c?.systemServingStatus ?? "—"}`);
    }
  } catch (e: any) { console.log(`  ⚠️  Keyword query failed: ${e.message}`); }
  console.log("");

  // 3d) Ad schedule (dayparting) — a common "no traffic at certain hours" cause.
  console.log(`── AD SCHEDULE (dayparting) ──`);
  try {
    const sched = await gaql(cid, `
      SELECT campaign_criterion.ad_schedule.day_of_week,
             campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.end_hour
      FROM campaign_criterion
      WHERE campaign_criterion.type = 'AD_SCHEDULE' AND campaign_criterion.status != 'REMOVED'`, opts);
    if (!sched.length) console.log("  (none — runs all hours, all days)");
    for (const r of sched) {
      const s = r.campaignCriterion?.adSchedule;
      console.log(`  ${s?.dayOfWeek}: ${s?.startHour}:00–${s?.endHour}:00`);
    }
  } catch (e: any) { console.log(`  ⚠️  Schedule query failed: ${e.message}`); }
  console.log("");

  // 4) Today's spend per campaign vs budget (budget exhausted?).
  console.log(`── TODAY'S SPEND (${today}) ──`);
  const todaySpend = await gaql(cid, `
    SELECT campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks
    FROM campaign
    WHERE segments.date = '${today}' AND campaign.status != 'REMOVED'`, opts);
  if (!todaySpend.length) console.log("  (no rows for today — zero impressions so far)");
  for (const r of todaySpend) {
    const cost = (Number(r.metrics?.costMicros ?? 0) / 1_000_000).toFixed(2);
    console.log(`  ${r.campaign?.name}: RM ${cost} spent · ${r.metrics?.impressions ?? 0} impr · ${r.metrics?.clicks ?? 0} clicks`);
  }
  console.log("");

  // 5) Hour-by-hour today — WHEN did it stop?
  console.log(`── HOUR-BY-HOUR TODAY (MYT, ${today}) ──`);
  const hourly = await gaql(cid, `
    SELECT segments.hour, metrics.impressions, metrics.clicks, metrics.cost_micros
    FROM campaign
    WHERE segments.date = '${today}'
    ORDER BY segments.hour`, opts);
  const byHour = new Map<number, { impr: number; clicks: number; cost: number }>();
  for (const r of hourly) {
    const h = Number(r.segments?.hour ?? -1);
    if (h < 0) continue;
    const cur = byHour.get(h) ?? { impr: 0, clicks: 0, cost: 0 };
    cur.impr += Number(r.metrics?.impressions ?? 0);
    cur.clicks += Number(r.metrics?.clicks ?? 0);
    cur.cost += Number(r.metrics?.costMicros ?? 0) / 1_000_000;
    byHour.set(h, cur);
  }
  if (!byHour.size) console.log("  (no impressions at any hour today)");
  for (let h = 0; h <= 23; h++) {
    const d = byHour.get(h);
    if (!d) continue;
    console.log(`  ${String(h).padStart(2, "0")}:00  ${String(d.impr).padStart(5)} impr  ${String(d.clicks).padStart(4)} clk  RM ${d.cost.toFixed(2)}`);
  }
  console.log("");

  // 6) Ad approval — are the ads disapproved?
  console.log(`── AD APPROVAL STATUS ──`);
  try {
    const ads = await gaql(cid, `
      SELECT campaign.name, ad_group.name, ad_group_ad.status,
             ad_group_ad.policy_summary.approval_status,
             ad_group_ad.policy_summary.review_status,
             ad_group_ad.primary_status, ad_group_ad.primary_status_reasons
      FROM ad_group_ad
      WHERE ad_group_ad.status != 'REMOVED'`, opts);
    if (!ads.length) console.log("  ⚠️  NO ACTIVE ADS FOUND — a campaign with no ads cannot serve.");
    for (const r of ads) {
      const a = r.adGroupAd;
      const flag = a?.policySummary?.approvalStatus !== "APPROVED" ? "⚠️" : "✓";
      console.log(`  ${flag} [${r.campaign?.name} / ${r.adGroup?.name}] status=${a?.status} approval=${a?.policySummary?.approvalStatus} review=${a?.policySummary?.reviewStatus} primary=${a?.primaryStatus}`);
      if (a?.primaryStatusReasons?.length) console.log(`       reasons: ${a.primaryStatusReasons.join(", ")}`);
    }
  } catch (e: any) { console.log(`  ⚠️  Ad query failed: ${e.message}`); }
  console.log("");

  // 7) Ad group level — enabled? any keywords?
  console.log(`── AD GROUPS ──`);
  try {
    const ags = await gaql(cid, `
      SELECT campaign.name, ad_group.name, ad_group.status, ad_group.primary_status,
             ad_group.primary_status_reasons
      FROM ad_group
      WHERE ad_group.status != 'REMOVED'`, opts);
    if (!ags.length) console.log("  ⚠️  NO ACTIVE AD GROUPS.");
    for (const r of ags) {
      const g = r.adGroup;
      console.log(`  [${r.campaign?.name}] ${g?.name}: status=${g?.status} primary=${g?.primaryStatus}${g?.primaryStatusReasons?.length ? " reasons=" + g.primaryStatusReasons.join(",") : ""}`);
    }
  } catch (e: any) { console.log(`  ⚠️  Ad group query failed: ${e.message}`); }
  console.log("\n=== END DIAGNOSIS ===\n");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
