/**
 * Apply ONE approved search-term negative keyword to Google Ads (Feature: AI
 * Search Terms Analyzer, apply layer). Mirrors build-runner.buildBlueprint:
 *
 *  - DARK by default. Until Google grants Basic (write) access AND
 *    ADS_AUTOMATION_ENABLED=true, this only dry-run-VALIDATES the negative
 *    against Google (creates nothing) and returns the "apply by hand" notice.
 *  - Only a reviewed row (APPROVED or EDITED) with an EXCLUDE decision + a
 *    negative keyword + a real campaign id can be applied.
 *  - v1 applies at CAMPAIGN level (search-term rows carry a campaign id but not
 *    an ad-group id). Ad-group / shared-list levels are deferred.
 *  - Before applying it runs a NON-blocking overlap check (brand + converting
 *    keywords/terms) and stores the warning on the row.
 */
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  adAccounts,
  keywordMetrics,
  searchTermAnalyses,
  searchTerms,
} from "@/db/schema";
import { decryptToken } from "@/lib/crypto/envelope";
import { loadAnalysisSettings } from "@/lib/ads/analysis-settings";
import { MATCH_TYPES, overlapWarning } from "@/lib/ai/search-terms-core";
import { getAccessTokenForRefreshToken } from "./auth";
import { ADS_WRITE_DISABLED_MESSAGE, adsWriteEnabled } from "./access";
import { runMutate, type MutateOptions } from "./mutate";
import { normalizeCustomerId } from "./client";

export type ApplyOutcome = {
  ok: boolean;
  applied: boolean;
  validated?: boolean;
  message?: string;
  error?: string;
  overlapWarning?: string | null;
};

/** Per-account credentials: its own encrypted token if present, else global. */
async function credsFor(account: {
  accessTokenEncrypted: string | null;
}): Promise<MutateOptions> {
  if (account.accessTokenEncrypted) {
    const refreshToken = decryptToken(account.accessTokenEncrypted);
    const accessToken = await getAccessTokenForRefreshToken(refreshToken);
    return { accessToken };
  }
  return {};
}

/** Converting keyword/term text for an account (for the overlap check). */
async function convertingPhrases(accountId: string): Promise<string[]> {
  const [kw, st] = await Promise.all([
    db
      .select({ text: keywordMetrics.keywordText })
      .from(keywordMetrics)
      .where(
        and(
          eq(keywordMetrics.adAccountId, accountId),
          gt(keywordMetrics.conversions, "0")
        )
      )
      .groupBy(keywordMetrics.keywordText)
      .limit(2000),
    db
      .select({ text: searchTerms.term })
      .from(searchTerms)
      .where(
        and(eq(searchTerms.adAccountId, accountId), gt(searchTerms.conversions, "0"))
      )
      .groupBy(searchTerms.term)
      .limit(2000),
  ]);
  const set = new Set<string>();
  for (const r of kw) if (r.text) set.add(r.text);
  for (const r of st) if (r.text) set.add(r.text);
  return [...set];
}

export async function applyNegative(analysisId: string): Promise<ApplyOutcome> {
  const row = await db.query.searchTermAnalyses.findFirst({
    where: eq(searchTermAnalyses.id, analysisId),
  });
  if (!row) return { ok: false, applied: false, error: "Analysis not found." };

  if (row.reviewStatus === "APPLIED") {
    return { ok: true, applied: true, message: "Already applied." };
  }
  if (row.reviewStatus !== "APPROVED" && row.reviewStatus !== "EDITED") {
    return {
      ok: false,
      applied: false,
      error: "Approve (or edit) this recommendation before applying.",
    };
  }

  const negative = (row.editedNegativeKeyword ?? row.suggestedNegativeKeyword ?? "").trim();
  if (row.decision !== "EXCLUDE" || !negative) {
    return {
      ok: false,
      applied: false,
      error: "Nothing to apply — this term has no negative keyword recommendation.",
    };
  }
  if (!row.campaignExternalId) {
    return {
      ok: false,
      applied: false,
      error: "This analysis isn't tied to a specific campaign, so a campaign-level negative can't be built. Re-run analysis per campaign.",
    };
  }

  const rawMatch = row.editedMatchType ?? row.suggestedMatchType ?? "PHRASE";
  const matchType = (MATCH_TYPES as readonly string[]).includes(rawMatch) && rawMatch !== "NONE"
    ? (rawMatch as "EXACT" | "PHRASE" | "BROAD")
    : "PHRASE";

  const account = await db.query.adAccounts.findFirst({
    where: eq(adAccounts.id, row.adAccountId),
    columns: {
      externalAccountId: true,
      accessTokenEncrypted: true,
      platform: true,
    },
  });
  if (!account) return { ok: false, applied: false, error: "Ad account not found." };
  if (account.platform !== "google") {
    return { ok: false, applied: false, error: "Only Google Ads accounts can apply negatives." };
  }

  // Non-blocking overlap check (brand + converting keywords/terms).
  const settings = await loadAnalysisSettings(row.adAccountId, row.campaignExternalId);
  const warning = overlapWarning({
    negative,
    matchType,
    brandNames: settings.brandNames,
    convertingPhrases: await convertingPhrases(row.adAccountId),
  });
  if (warning !== (row.overlapWarning ?? null)) {
    await db
      .update(searchTermAnalyses)
      .set({ overlapWarning: warning, updatedAt: new Date() })
      .where(eq(searchTermAnalyses.id, analysisId));
  }

  const cid = normalizeCustomerId(account.externalAccountId);
  const op = {
    campaignCriterionOperation: {
      create: {
        campaign: `customers/${cid}/campaigns/${row.campaignExternalId}`,
        negative: true,
        keyword: { text: negative, matchType },
      },
    },
  };
  const creds = await credsFor(account);

  // DARK: validate-only until write access + flag are both on.
  if (!adsWriteEnabled()) {
    try {
      await runMutate(cid, [op], creds, { validateOnly: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(searchTermAnalyses)
        .set({ applyError: msg, updatedAt: new Date() })
        .where(eq(searchTermAnalyses.id, analysisId));
      return { ok: false, applied: false, error: msg, overlapWarning: warning };
    }
    return {
      ok: true,
      applied: false,
      validated: true,
      message: ADS_WRITE_DISABLED_MESSAGE,
      overlapWarning: warning,
    };
  }

  // LIVE: actually create the negative.
  try {
    const result = await runMutate(cid, [op], creds, { validateOnly: false });
    const resourceName = result.resourceNames[0] ?? null;
    await db
      .update(searchTermAnalyses)
      .set({
        reviewStatus: "APPLIED",
        appliedAt: new Date(),
        applyError: null,
        googleResourceName: resourceName,
        googleResponse: result.raw as object,
        updatedAt: new Date(),
      })
      .where(eq(searchTermAnalyses.id, analysisId));
    return { ok: true, applied: true, overlapWarning: warning };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(searchTermAnalyses)
      .set({
        reviewStatus: "APPLY_FAILED",
        applyError: msg,
        updatedAt: new Date(),
      })
      .where(eq(searchTermAnalyses.id, analysisId));
    return { ok: false, applied: false, error: msg, overlapWarning: warning };
  }
}
