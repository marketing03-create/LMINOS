CREATE TYPE "public"."competitor_strategy" AS ENUM('EXCLUDE_ALL', 'MONITOR', 'ALLOW');--> statement-breakpoint
CREATE TYPE "public"."neg_kw_level" AS ENUM('AD_GROUP', 'CAMPAIGN', 'SHARED_LIST', 'ACCOUNT', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."neg_kw_match_type" AS ENUM('EXACT', 'PHRASE', 'BROAD', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."recommendation_type" AS ENUM('NEGATIVE_KEYWORD', 'POSITIVE_KEYWORD', 'NEW_AD_GROUP', 'LANDING_PAGE', 'AD_COPY', 'MONITOR_ONLY');--> statement-breakpoint
CREATE TYPE "public"."search_term_decision" AS ENUM('KEEP', 'MONITOR', 'EXCLUDE');--> statement-breakpoint
CREATE TYPE "public"."search_term_review_status" AS ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EDITED', 'APPLIED', 'APPLY_FAILED');--> statement-breakpoint
CREATE TYPE "public"."search_term_risk" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TABLE "campaign_analysis_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"campaign_external_id" text DEFAULT '' NOT NULL,
	"services_offered" text[],
	"services_not_offered" text[],
	"supported_locations" text[],
	"unsupported_locations" text[],
	"accepted_employment_types" text[],
	"rejected_employment_types" text[],
	"accepted_salary_methods" text[],
	"rejected_salary_methods" text[],
	"min_salary" integer,
	"competitor_strategy" "competitor_strategy" DEFAULT 'MONITOR' NOT NULL,
	"mobile_app_available" boolean DEFAULT false NOT NULL,
	"online_app_available" boolean DEFAULT true NOT NULL,
	"brand_names" text[],
	"product_names" text[],
	"target_cost_per_lead_myr" numeric(14, 2),
	"high_spend_threshold_myr" numeric(14, 2),
	"min_clicks_before_exclude" integer DEFAULT 5 NOT NULL,
	"min_cost_before_exclude_myr" numeric(14, 2) DEFAULT '20' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_analysis_settings_uq" UNIQUE("ad_account_id","campaign_external_id")
);
--> statement-breakpoint
CREATE TABLE "search_term_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"campaign_external_id" text DEFAULT '' NOT NULL,
	"campaign_name" text,
	"term" text NOT NULL,
	"date_from" text NOT NULL,
	"date_to" text NOT NULL,
	"metrics_snapshot" jsonb,
	"decision" "search_term_decision" NOT NULL,
	"recommendation_type" "recommendation_type" DEFAULT 'MONITOR_ONLY' NOT NULL,
	"intent_category" text,
	"commercial_intent" text,
	"relevance_score" integer,
	"reason" text NOT NULL,
	"language" text,
	"suggested_negative_keyword" text,
	"suggested_match_type" "neg_kw_match_type",
	"suggested_level" "neg_kw_level",
	"risk_level" "search_term_risk",
	"risk_explanation" text,
	"confidence_score" integer,
	"needs_human_review" boolean DEFAULT true NOT NULL,
	"rule_applied" text,
	"overlap_warning" text,
	"model_used" text,
	"prompt_version" text,
	"token_usage" integer,
	"review_status" "search_term_review_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"edited_negative_keyword" text,
	"edited_match_type" "neg_kw_match_type",
	"edited_level" "neg_kw_level",
	"notes" text,
	"applied_at" timestamp with time zone,
	"apply_error" text,
	"google_resource_name" text,
	"google_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_term_analyses_uq" UNIQUE("ad_account_id","campaign_external_id","term","date_from","date_to")
);
--> statement-breakpoint
ALTER TABLE "campaign_analysis_settings" ADD CONSTRAINT "campaign_analysis_settings_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_term_analyses" ADD CONSTRAINT "search_term_analyses_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_term_analyses" ADD CONSTRAINT "search_term_analyses_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_term_analyses_acct_status_idx" ON "search_term_analyses" USING btree ("ad_account_id","review_status");--> statement-breakpoint
CREATE INDEX "search_term_analyses_decision_idx" ON "search_term_analyses" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "search_term_analyses_status_created_idx" ON "search_term_analyses" USING btree ("review_status","created_at");