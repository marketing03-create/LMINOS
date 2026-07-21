import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import {
  negKwLevelEnum,
  negKwMatchTypeEnum,
  recommendationTypeEnum,
  searchTermDecisionEnum,
  searchTermReviewStatusEnum,
  searchTermRiskEnum,
} from "./enums";
import { adAccounts } from "./ad-accounts";
import { users } from "./users";

/**
 * AI Search Terms Analyzer — one row per analysed search term. The AI classifies
 * every term (KEEP/MONITOR/EXCLUDE) and, for EXCLUDE, recommends a negative
 * keyword (+ match type, level, risk). A human reviews/edits/approves; only then
 * may LMIROS push the negative to Google (and only when write access is enabled —
 * otherwise it dry-run-validates, exactly like Feature R / ad_proposals).
 *
 * The ORIGINAL AI recommendation (suggested*) is never overwritten; a reviewer's
 * changes go into the edited* columns so the audit trail stays intact.
 */
export const searchTermAnalyses = pgTable(
  "search_term_analyses",
  {
    id: id(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    campaignExternalId: text("campaign_external_id").notNull().default(""),
    campaignName: text("campaign_name"),
    term: text("term").notNull(),
    // The reporting window the analysis is for (idempotency key part).
    dateFrom: text("date_from").notNull(), // YYYY-MM-DD
    dateTo: text("date_to").notNull(), // YYYY-MM-DD
    // Metrics at analysis time (spend/clicks/impressions/conversions + derived),
    // frozen so the recommendation is reproducible even as new data syncs.
    metricsSnapshot: jsonb("metrics_snapshot"),

    // ── AI output (validated against the Zod schema before insert) ──
    decision: searchTermDecisionEnum("decision").notNull(),
    recommendationType: recommendationTypeEnum("recommendation_type")
      .notNull()
      .default("MONITOR_ONLY"),
    intentCategory: text("intent_category"),
    commercialIntent: text("commercial_intent"), // low | medium | high
    relevanceScore: integer("relevance_score"), // 0–100
    reason: text("reason").notNull(),
    language: text("language"),
    suggestedNegativeKeyword: text("suggested_negative_keyword"),
    suggestedMatchType: negKwMatchTypeEnum("suggested_match_type"),
    suggestedLevel: negKwLevelEnum("suggested_level"),
    riskLevel: searchTermRiskEnum("risk_level"),
    riskExplanation: text("risk_explanation"),
    confidenceScore: integer("confidence_score"), // 0–100
    needsHumanReview: boolean("needs_human_review").notNull().default(true),
    // Which deterministic rule (if any) shaped the final call — for transparency.
    ruleApplied: text("rule_applied"),
    // Overlap-risk warning computed at analysis/apply time (never null-blocking).
    overlapWarning: text("overlap_warning"),

    modelUsed: text("model_used"),
    promptVersion: text("prompt_version"),
    tokenUsage: integer("token_usage"),

    // ── Human review state ──
    reviewStatus: searchTermReviewStatusEnum("review_status")
      .notNull()
      .default("PENDING_REVIEW"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    // A reviewer's overrides — never overwrite the AI's suggested* fields.
    editedNegativeKeyword: text("edited_negative_keyword"),
    editedMatchType: negKwMatchTypeEnum("edited_match_type"),
    editedLevel: negKwLevelEnum("edited_level"),
    notes: text("notes"),

    // ── Apply-to-Google outcome ──
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    applyError: text("apply_error"),
    googleResourceName: text("google_resource_name"),
    googleResponse: jsonb("google_response"),

    ...timestamps(),
  },
  (t) => ({
    // One analysis per (account, campaign, term, window) — re-analysing upserts.
    uq: unique("search_term_analyses_uq").on(
      t.adAccountId,
      t.campaignExternalId,
      t.term,
      t.dateFrom,
      t.dateTo
    ),
    acctStatusIdx: index("search_term_analyses_acct_status_idx").on(
      t.adAccountId,
      t.reviewStatus
    ),
    decisionIdx: index("search_term_analyses_decision_idx").on(t.decision),
    statusCreatedIdx: index("search_term_analyses_status_created_idx").on(
      t.reviewStatus,
      t.createdAt
    ),
  })
);
