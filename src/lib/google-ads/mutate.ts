/**
 * Google Ads WRITE layer (Feature R, the deferred Pillar 5) — REST `:mutate`.
 *
 * Mirrors client.ts (raw fetch, no gRPC dep). `runMutate` sends a batch of
 * mutate operations; `validateOnly` is the dry-run/live switch — Google
 * validates the whole batch and returns errors WITHOUT creating anything, which
 * is how the Account Builder works safely while Basic write access is pending.
 *
 * The per-resource CREATE operations are produced by `blueprintToBuildSteps`
 * (ads-planner-core.ts). This file adds the network call, the customer-id
 * substitution, and the reverse REMOVE operations used for teardown/revert.
 */
import { CID_PLACEHOLDER, type BuildStepKind } from "@/lib/ai/ads-planner-core";
import { getGoogleAdsAccessToken } from "./auth";
import { normalizeCustomerId } from "./client";

// Pinned in client.ts too; bump both together when upgrading (404 HTML = lapsed).
const API_VERSION = "v23";

export type MutateOptions = { accessToken?: string; loginCustomerId?: string };

export type MutateResult = {
  /** Resource name per operation (best-effort; empty on validate-only). */
  resourceNames: (string | null)[];
  raw: unknown;
};

/** Replace the CID placeholder baked into stored build-step payloads. */
export function substituteCid<T>(payload: T, customerId: string): T {
  const cid = normalizeCustomerId(customerId);
  return JSON.parse(
    JSON.stringify(payload).split(CID_PLACEHOLDER).join(cid)
  ) as T;
}

const REMOVE_OP_KEY: Record<BuildStepKind, string | null> = {
  create_customer_client: null, // accounts aren't torn down here
  create_campaign_budget: "campaignBudgetOperation",
  create_campaign: "campaignOperation",
  create_campaign_criterion: "campaignCriterionOperation",
  create_ad_group: "adGroupOperation",
  create_ad_group_criterion: "adGroupCriterionOperation",
  create_ad_group_ad: "adGroupAdOperation",
  create_conversion_action: "conversionActionOperation",
};

/** Build the REMOVE operation that undoes a created resource (for revert). */
export function removeOp(
  kind: BuildStepKind,
  resourceName: string
): Record<string, unknown> | null {
  const key = REMOVE_OP_KEY[kind];
  if (!key || !resourceName) return null;
  return { [key]: { remove: resourceName } };
}

/** Pull the resourceName out of one mutateOperationResponse, if present. */
function extractResourceName(resp: unknown): string | null {
  if (!resp || typeof resp !== "object") return null;
  const inner = Object.values(resp as Record<string, unknown>)[0];
  if (inner && typeof inner === "object" && "resourceName" in inner) {
    const rn = (inner as { resourceName?: unknown }).resourceName;
    return typeof rn === "string" ? rn : null;
  }
  return null;
}

/**
 * Run a batch of Google Ads mutate operations against one customer account.
 * Defaults to `validateOnly: true` (dry-run) — pass `false` to actually write.
 * Uses the per-account access token when supplied (opts.accessToken), else the
 * global credentials. Throws with the Google error message on failure.
 */
export async function runMutate(
  customerId: string,
  mutateOperations: Record<string, unknown>[],
  opts: MutateOptions = {},
  { validateOnly = true }: { validateOnly?: boolean } = {}
): Promise<MutateResult> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN must be set");
  const loginCustomerId =
    opts.loginCustomerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const cid = normalizeCustomerId(customerId);
  const accessToken = opts.accessToken ?? (await getGoogleAdsAccessToken());

  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${cid}/googleAds:mutate`;
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
    body: JSON.stringify({
      mutateOperations,
      validateOnly,
      responseContentType: "RESOURCE_NAME_ONLY",
    }),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `Google Ads mutate: non-JSON HTTP ${res.status}: ${text.slice(0, 300)}`
    );
  }

  if (!res.ok) {
    const errObj = Array.isArray(parsed) ? parsed[0] : parsed;
    const msg =
      (errObj as { error?: { message?: string } })?.error?.message ??
      JSON.stringify(parsed).slice(0, 600);
    throw new Error(`Google Ads mutate failed: HTTP ${res.status} ${msg}`);
  }

  // A 200 can still carry a partialFailureError when partial_failure is on; we
  // don't request it (all-or-nothing), but surface it defensively if present.
  const pf = (parsed as { partialFailureError?: { message?: string } })
    ?.partialFailureError;
  if (pf?.message) {
    throw new Error(`Google Ads mutate partial failure: ${pf.message}`);
  }

  const responses =
    (parsed as { mutateOperationResponses?: unknown[] })
      ?.mutateOperationResponses ?? [];
  return {
    resourceNames: responses.map(extractResourceName),
    raw: parsed,
  };
}
