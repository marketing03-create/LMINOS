import { pgEnum } from "drizzle-orm/pg-core";

export const platformEnum = pgEnum("platform", ["meta", "google", "tiktok"]);

export const adAccountStatusEnum = pgEnum("ad_account_status", [
  "active",
  "suspended",
  "replaced",
]);

// AI Google Ads co-pilot (Feature L, pillars 3–4). A proposal is a single
// data-grounded change Claude suggests; a human approves/rejects it before it
// ever touches Google Ads.
export const adProposalTypeEnum = pgEnum("ad_proposal_type", [
  "add_negative_keyword",
  "pause_keyword",
  "adjust_budget",
  "new_ad_copy",
  // A relevant-but-underperforming term to WATCH (keep running), not exclude —
  // the experienced-marketer call when a term has cost/clicks but no conversions
  // yet still shows real loan intent.
  "monitor_term",
]);

export const adProposalStatusEnum = pgEnum("ad_proposal_status", [
  "pending",
  "approved",
  "rejected",
  "applied",
  "failed",
]);

export const adProposalRiskEnum = pgEnum("ad_proposal_risk", [
  "low",
  "medium",
  "high",
]);

// AI Google Ads Account Builder (Feature R). A blueprint is a whole proposed
// account (campaigns → ad groups → keywords/ads) the AI drafts; a human
// reviews/approves, then LMIROS builds it via the write/apply layer. Build
// steps are the ordered individual :mutate operations (one row each) so a
// partial failure is recoverable and every created resource is revertible.
export const adBlueprintStatusEnum = pgEnum("ad_blueprint_status", [
  "draft",
  "pending",
  "approved",
  "validating",
  "building",
  "built",
  "failed",
  "reverted",
  "rejected",
]);

export const adBlueprintRiskEnum = pgEnum("ad_blueprint_risk", [
  "low",
  "medium",
  "high",
]);

export const adBuildStepKindEnum = pgEnum("ad_build_step_kind", [
  "create_customer_client", // reserved for the deferred API-create-account path
  "create_campaign_budget",
  "create_campaign",
  "create_campaign_criterion",
  "create_ad_group",
  "create_ad_group_criterion",
  "create_ad_group_ad",
  "create_conversion_action",
]);

export const adBuildStepStatusEnum = pgEnum("ad_build_step_status", [
  "pending",
  "validated",
  "applied",
  "failed",
  "skipped",
  "reverted",
]);

// AI Search Terms Analyzer. Per-term classification + negative-keyword
// recommendation the AI produces; a human reviews/edits/approves before any
// negative reaches Google. Values are UPPERCASE to match the AI's JSON output
// verbatim (no case mapping between the model, the schema, and the DB).
export const searchTermDecisionEnum = pgEnum("search_term_decision", [
  "KEEP",
  "MONITOR",
  "EXCLUDE",
]);

export const searchTermReviewStatusEnum = pgEnum("search_term_review_status", [
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "EDITED",
  "APPLIED",
  "APPLY_FAILED",
]);

export const negKwMatchTypeEnum = pgEnum("neg_kw_match_type", [
  "EXACT",
  "PHRASE",
  "BROAD",
  "NONE",
]);

export const negKwLevelEnum = pgEnum("neg_kw_level", [
  "AD_GROUP",
  "CAMPAIGN",
  "SHARED_LIST",
  "ACCOUNT",
  "NONE",
]);

export const searchTermRiskEnum = pgEnum("search_term_risk", [
  "LOW",
  "MEDIUM",
  "HIGH",
]);

export const recommendationTypeEnum = pgEnum("recommendation_type", [
  "NEGATIVE_KEYWORD",
  "POSITIVE_KEYWORD",
  "NEW_AD_GROUP",
  "LANDING_PAGE",
  "AD_COPY",
  "MONITOR_ONLY",
]);

// How a campaign/account should treat searches for named competitors. Configured
// per account (or per campaign) in campaign_analysis_settings; the analyzer obeys it.
export const competitorStrategyEnum = pgEnum("competitor_strategy", [
  "EXCLUDE_ALL",
  "MONITOR",
  "ALLOW",
]);

export const loanTypeEnum = pgEnum("loan_type", [
  "personal",
  "bank",
  "angkasa",
  "car",
  "sme",
]);

export const sourcePlatformEnum = pgEnum("source_platform", [
  "website",
  "meta",
  "google",
  "tiktok",
  "referral",
  "manual",
  "csv_import",
]);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "pending",
  "approved",
  "rejected",
  "closed",
  "not_suitable",
  "unreachable",
  "duplicate_merged",
]);

export const priorityLevelEnum = pgEnum("priority_level", [
  "hot",
  "warm",
  "cold",
  "vip",
]);

export const locationRegionEnum = pgEnum("location_region", [
  "kl",
  "selangor",
  "seremban",
  "putrajaya",
  "out_of_coverage",
  "unknown",
]);

export const matchConfidenceEnum = pgEnum("match_confidence", [
  "exact_phone",
  "exact_email",
  "fuzzy",
  "manual",
  "unmatched",
]);

export const rejectionReasonEnum = pgEnum("rejection_reason", [
  "out_of_coverage",
  "not_eligible",
  "wrong_loan_type",
  "docs_incomplete",
  "unreachable",
  "duplicate_reusable",
  "low_quality",
  "not_suitable",
  "other",
]);

export const nextActionEnum = pgEnum("next_action", [
  "recycle_later",
  "reallocate_loan_type",
  "sell_external",
  "archive",
  "none",
]);

export const userRoleEnum = pgEnum("user_role", [
  "hq_admin",
  "marketing_manager",
  "team_lead",
  "sales_agent",
  "viewer",
  // A TikTok streamer: a restricted login that only sees + uploads results for
  // the TikTok handle(s) assigned to them (Feature U). No access to leads,
  // ROAS, ad spend, or other handles.
  "live_streamer",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "new_lead",
  "sla_breach",
  "vip_lead",
  "routing_failure",
  "recycle_added",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "telegram",
  "dashboard",
  "email",
]);
