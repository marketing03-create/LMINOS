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
