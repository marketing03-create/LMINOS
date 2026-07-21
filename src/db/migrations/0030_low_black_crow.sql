ALTER TABLE "ad_accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_blueprints" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_build_steps" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_proposals" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_spend" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assignments_history" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brands" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_analysis_settings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_sets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ads" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaigns" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hourly_metrics" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "website_agents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "websites" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teams" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lead_touchpoints" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leads" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales_records" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rejected_leads" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "keyword_metrics" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "search_terms" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "search_term_analyses" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "routing_rules" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sheet_sync_state" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "ad_accounts" CASCADE;--> statement-breakpoint
DROP TABLE "ad_blueprints" CASCADE;--> statement-breakpoint
DROP TABLE "ad_build_steps" CASCADE;--> statement-breakpoint
DROP TABLE "ad_proposals" CASCADE;--> statement-breakpoint
DROP TABLE "ad_spend" CASCADE;--> statement-breakpoint
DROP TABLE "assignments_history" CASCADE;--> statement-breakpoint
DROP TABLE "brands" CASCADE;--> statement-breakpoint
DROP TABLE "campaign_analysis_settings" CASCADE;--> statement-breakpoint
DROP TABLE "ad_sets" CASCADE;--> statement-breakpoint
DROP TABLE "ads" CASCADE;--> statement-breakpoint
DROP TABLE "campaigns" CASCADE;--> statement-breakpoint
DROP TABLE "hourly_metrics" CASCADE;--> statement-breakpoint
DROP TABLE "website_agents" CASCADE;--> statement-breakpoint
DROP TABLE "websites" CASCADE;--> statement-breakpoint
DROP TABLE "teams" CASCADE;--> statement-breakpoint
DROP TABLE "lead_touchpoints" CASCADE;--> statement-breakpoint
DROP TABLE "leads" CASCADE;--> statement-breakpoint
DROP TABLE "sales_records" CASCADE;--> statement-breakpoint
DROP TABLE "rejected_leads" CASCADE;--> statement-breakpoint
DROP TABLE "keyword_metrics" CASCADE;--> statement-breakpoint
DROP TABLE "search_terms" CASCADE;--> statement-breakpoint
DROP TABLE "search_term_analyses" CASCADE;--> statement-breakpoint
DROP TABLE "notifications" CASCADE;--> statement-breakpoint
DROP TABLE "routing_rules" CASCADE;--> statement-breakpoint
DROP TABLE "sheet_sync_state" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "tiktok_accounts" DROP CONSTRAINT IF EXISTS "tiktok_accounts_brand_id_brands_id_fk";
--> statement-breakpoint
ALTER TABLE "tiktok_accounts" DROP CONSTRAINT IF EXISTS "tiktok_accounts_website_id_websites_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'viewer';--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "team_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "daily_capacity";--> statement-breakpoint
ALTER TABLE "tiktok_accounts" DROP COLUMN "brand_id";--> statement-breakpoint
ALTER TABLE "tiktok_accounts" DROP COLUMN "website_id";--> statement-breakpoint
DROP TYPE "public"."ad_account_status";--> statement-breakpoint
DROP TYPE "public"."ad_blueprint_risk";--> statement-breakpoint
DROP TYPE "public"."ad_blueprint_status";--> statement-breakpoint
DROP TYPE "public"."ad_build_step_kind";--> statement-breakpoint
DROP TYPE "public"."ad_build_step_status";--> statement-breakpoint
DROP TYPE "public"."ad_proposal_risk";--> statement-breakpoint
DROP TYPE "public"."ad_proposal_status";--> statement-breakpoint
DROP TYPE "public"."ad_proposal_type";--> statement-breakpoint
DROP TYPE "public"."competitor_strategy";--> statement-breakpoint
DROP TYPE "public"."lead_status";--> statement-breakpoint
DROP TYPE "public"."loan_type";--> statement-breakpoint
DROP TYPE "public"."location_region";--> statement-breakpoint
DROP TYPE "public"."match_confidence";--> statement-breakpoint
DROP TYPE "public"."neg_kw_level";--> statement-breakpoint
DROP TYPE "public"."neg_kw_match_type";--> statement-breakpoint
DROP TYPE "public"."next_action";--> statement-breakpoint
DROP TYPE "public"."notification_channel";--> statement-breakpoint
DROP TYPE "public"."notification_type";--> statement-breakpoint
DROP TYPE "public"."platform";--> statement-breakpoint
DROP TYPE "public"."priority_level";--> statement-breakpoint
DROP TYPE "public"."recommendation_type";--> statement-breakpoint
DROP TYPE "public"."rejection_reason";--> statement-breakpoint
DROP TYPE "public"."search_term_decision";--> statement-breakpoint
DROP TYPE "public"."search_term_review_status";--> statement-breakpoint
DROP TYPE "public"."search_term_risk";--> statement-breakpoint
DROP TYPE "public"."source_platform";