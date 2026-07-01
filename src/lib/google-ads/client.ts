/**
 * Google Ads API client (REST + GAQL).
 *
 * We hit the REST `googleAds:searchStream` endpoint directly with fetch rather
 * than pulling in the gRPC client library — same approach as the Zoho client,
 * dependency-light and tsx-safe.
 *
 * Docs: https://developers.google.com/google-ads/api/docs/reporting/overview
 */
import { getGoogleAdsAccessToken } from "./auth";

/**
 * Pin a stable API version; bump deliberately when upgrading. Google sunsets
 * each version ~12 months after release (monthly release cadence since 2026),
 * so this needs an occasional bump — a 404 HTML response means it has lapsed.
 * v23 (released Jan 2026) is supported into ~2027.
 */
const API_VERSION = "v23";

export type GoogleAdsCampaignDay = {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  cost: number; // MYR (cost_micros / 1_000_000)
  conversions: number; // platform-reported (may be fractional)
};

/** Strip dashes/spaces from a customer id → digits only. */
export function normalizeCustomerId(id: string): string {
  return id.replace(/\D/g, "");
}

type SearchRow = {
  campaign?: { id?: string; name?: string; status?: string };
  segments?: { date?: string };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    costMicros?: string | number;
    conversions?: string | number;
  };
};
type StreamResponse = { results?: SearchRow[] };

/**
 * Fetch one row per campaign × day for the given window (inclusive dates,
 * 'YYYY-MM-DD'). Requires the developer token + login-customer-id (MCC) env.
 */
export async function fetchCampaignMetrics(
  customerId: string,
  sinceISO: string,
  untilISO: string,
  opts: { accessToken?: string; loginCustomerId?: string } = {}
): Promise<GoogleAdsCampaignDay[]> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  // Per-account override wins; else the global env default (may be empty =
  // direct access, no manager header).
  const loginCustomerId =
    opts.loginCustomerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (!devToken) {
    throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN must be set");
  }

  const cid = normalizeCustomerId(customerId);
  // Per-account access token (from its own refresh token) or the global one.
  const accessToken = opts.accessToken ?? (await getGoogleAdsAccessToken());

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${sinceISO}' AND '${untilISO}'
    ORDER BY segments.date
  `.trim();

  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${cid}/googleAds:searchStream`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": devToken,
    "content-type": "application/json",
  };
  if (loginCustomerId) {
    headers["login-customer-id"] = normalizeCustomerId(loginCustomerId);
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Google Ads fetch: non-JSON response HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    // Errors come back as { error: {...} } or [{ error: {...} }].
    const errObj = Array.isArray(parsed) ? parsed[0] : parsed;
    const msg =
      (errObj as { error?: { message?: string; status?: string } })?.error
        ?.message ?? JSON.stringify(parsed).slice(0, 300);
    throw new Error(`Google Ads fetch failed: HTTP ${res.status} ${msg}`);
  }

  // searchStream returns an ARRAY of stream responses, each with `results`.
  const batches: StreamResponse[] = Array.isArray(parsed)
    ? (parsed as StreamResponse[])
    : [parsed as StreamResponse];

  const out: GoogleAdsCampaignDay[] = [];
  for (const batch of batches) {
    for (const row of batch.results ?? []) {
      const campaignId = String(row.campaign?.id ?? "");
      const date = row.segments?.date ?? "";
      if (!campaignId || !date) continue;
      out.push({
        campaignId,
        campaignName: row.campaign?.name ?? campaignId,
        campaignStatus: row.campaign?.status ?? "",
        date,
        impressions: Math.round(Number(row.metrics?.impressions ?? 0)),
        clicks: Math.round(Number(row.metrics?.clicks ?? 0)),
        cost: Number(row.metrics?.costMicros ?? 0) / 1_000_000,
        conversions: Number(row.metrics?.conversions ?? 0),
      });
    }
  }
  return out;
}

/** Run an arbitrary GAQL query via searchStream; returns the flattened rows. */
async function searchStream(
  customerId: string,
  query: string,
  opts: { accessToken?: string; loginCustomerId?: string } = {}
): Promise<unknown[]> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN must be set");
  const loginCustomerId =
    opts.loginCustomerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const cid = normalizeCustomerId(customerId);
  const accessToken = opts.accessToken ?? (await getGoogleAdsAccessToken());

  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${cid}/googleAds:searchStream`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": devToken,
    "content-type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = normalizeCustomerId(loginCustomerId);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: query.trim() }),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Google Ads fetch: non-JSON HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const errObj = Array.isArray(parsed) ? parsed[0] : parsed;
    const msg =
      (errObj as { error?: { message?: string } })?.error?.message ??
      JSON.stringify(parsed).slice(0, 300);
    throw new Error(`Google Ads fetch failed: HTTP ${res.status} ${msg}`);
  }
  const batches = (Array.isArray(parsed) ? parsed : [parsed]) as {
    results?: unknown[];
  }[];
  const rows: unknown[] = [];
  for (const b of batches) for (const r of b.results ?? []) rows.push(r);
  return rows;
}

// ── Keyword metrics (keyword_view) ──────────────────────────────────────────
export type GoogleAdsKeywordDay = {
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  criterionId: string;
  keywordText: string;
  matchType: string;
  status: string;
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
};
type KeywordRow = {
  campaign?: { id?: string | number; name?: string };
  adGroup?: { id?: string | number; name?: string };
  adGroupCriterion?: {
    criterionId?: string | number;
    status?: string;
    keyword?: { text?: string; matchType?: string };
  };
  segments?: { date?: string };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    costMicros?: string | number;
    conversions?: string | number;
  };
};

export async function fetchKeywordMetrics(
  customerId: string,
  sinceISO: string,
  untilISO: string,
  opts: { accessToken?: string; loginCustomerId?: string } = {}
): Promise<GoogleAdsKeywordDay[]> {
  const query = `
    SELECT campaign.id, campaign.name, ad_group.id, ad_group.name,
      ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type, ad_group_criterion.status,
      segments.date, metrics.impressions, metrics.clicks,
      metrics.cost_micros, metrics.conversions
    FROM keyword_view
    WHERE segments.date BETWEEN '${sinceISO}' AND '${untilISO}'
      AND ad_group_criterion.status != 'REMOVED'`;
  const rows = (await searchStream(customerId, query, opts)) as KeywordRow[];
  return rows
    .map((r) => ({
      campaignId: String(r.campaign?.id ?? ""),
      campaignName: r.campaign?.name ?? "",
      adGroupId: String(r.adGroup?.id ?? ""),
      adGroupName: r.adGroup?.name ?? "",
      criterionId: String(r.adGroupCriterion?.criterionId ?? ""),
      keywordText: r.adGroupCriterion?.keyword?.text ?? "",
      matchType: r.adGroupCriterion?.keyword?.matchType ?? "",
      status: r.adGroupCriterion?.status ?? "",
      date: r.segments?.date ?? "",
      impressions: Math.round(Number(r.metrics?.impressions ?? 0)),
      clicks: Math.round(Number(r.metrics?.clicks ?? 0)),
      cost: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
      conversions: Number(r.metrics?.conversions ?? 0),
    }))
    .filter((k) => k.criterionId && k.date);
}

// ── Search terms (search_term_view) ─────────────────────────────────────────
export type GoogleAdsSearchTermDay = {
  campaignId: string;
  campaignName: string;
  term: string;
  status: string;
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
};
type SearchTermRow = {
  campaign?: { id?: string | number; name?: string };
  searchTermView?: { searchTerm?: string; status?: string };
  segments?: { date?: string };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    costMicros?: string | number;
    conversions?: string | number;
  };
};

export async function fetchSearchTerms(
  customerId: string,
  sinceISO: string,
  untilISO: string,
  opts: { accessToken?: string; loginCustomerId?: string } = {}
): Promise<GoogleAdsSearchTermDay[]> {
  const query = `
    SELECT campaign.id, campaign.name, search_term_view.search_term,
      search_term_view.status, segments.date, metrics.impressions,
      metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM search_term_view
    WHERE segments.date BETWEEN '${sinceISO}' AND '${untilISO}'`;
  const rows = (await searchStream(customerId, query, opts)) as SearchTermRow[];
  return rows
    .map((r) => ({
      campaignId: String(r.campaign?.id ?? ""),
      campaignName: r.campaign?.name ?? "",
      term: r.searchTermView?.searchTerm ?? "",
      status: r.searchTermView?.status ?? "",
      date: r.segments?.date ?? "",
      impressions: Math.round(Number(r.metrics?.impressions ?? 0)),
      clicks: Math.round(Number(r.metrics?.clicks ?? 0)),
      cost: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
      conversions: Number(r.metrics?.conversions ?? 0),
    }))
    .filter((s) => s.term && s.date);
}

// ── Hour-of-day metrics (segments.hour × date) ──────────────────────────────
export type GoogleAdsHourDay = {
  date: string;
  hour: number; // 0–23, account timezone
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
};
type HourRow = {
  segments?: { date?: string; hour?: string | number };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    costMicros?: string | number;
    conversions?: string | number;
  };
};

/** Per campaign × date × hour rows (caller aggregates by date+hour). */
export async function fetchHourlyMetrics(
  customerId: string,
  sinceISO: string,
  untilISO: string,
  opts: { accessToken?: string; loginCustomerId?: string } = {}
): Promise<GoogleAdsHourDay[]> {
  const query = `
    SELECT segments.date, segments.hour, metrics.impressions,
      metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${sinceISO}' AND '${untilISO}'`;
  const rows = (await searchStream(customerId, query, opts)) as HourRow[];
  return rows
    .map((r) => ({
      date: r.segments?.date ?? "",
      hour: Math.round(Number(r.segments?.hour ?? -1)),
      impressions: Math.round(Number(r.metrics?.impressions ?? 0)),
      clicks: Math.round(Number(r.metrics?.clicks ?? 0)),
      cost: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
      conversions: Number(r.metrics?.conversions ?? 0),
    }))
    .filter((r) => r.date && r.hour >= 0 && r.hour <= 23);
}
