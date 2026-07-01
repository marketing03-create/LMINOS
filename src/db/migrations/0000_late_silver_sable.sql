CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'pending', 'approved', 'rejected', 'closed', 'not_suitable', 'unreachable', 'duplicate_merged');--> statement-breakpoint
CREATE TYPE "public"."loan_type" AS ENUM('personal', 'bank', 'angkasa', 'car', 'sme');--> statement-breakpoint
CREATE TYPE "public"."location_region" AS ENUM('kl', 'selangor', 'seremban', 'putrajaya', 'out_of_coverage', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."match_confidence" AS ENUM('exact_phone', 'exact_email', 'fuzzy', 'manual', 'unmatched');--> statement-breakpoint
CREATE TYPE "public"."next_action" AS ENUM('recycle_later', 'reallocate_loan_type', 'sell_external', 'archive', 'none');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('telegram', 'dashboard', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('new_lead', 'sla_breach', 'vip_lead', 'routing_failure', 'recycle_added');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('meta', 'google', 'tiktok');--> statement-breakpoint
CREATE TYPE "public"."priority_level" AS ENUM('hot', 'warm', 'cold', 'vip');--> statement-breakpoint
CREATE TYPE "public"."rejection_reason" AS ENUM('out_of_coverage', 'not_eligible', 'wrong_loan_type', 'docs_incomplete', 'unreachable', 'duplicate_reusable', 'low_quality', 'other');--> statement-breakpoint
CREATE TYPE "public"."source_platform" AS ENUM('website', 'meta', 'google', 'tiktok', 'referral', 'manual', 'csv_import');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('hq_admin', 'marketing_manager', 'team_lead', 'sales_agent', 'viewer');--> statement-breakpoint
CREATE TABLE "ad_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"external_account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"access_token_encrypted" text,
	"webhook_secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"campaign_id" uuid,
	"ad_set_id" uuid,
	"ad_id" uuid,
	"date" date NOT NULL,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"platform_leads_reported" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_spend_uq" UNIQUE NULLS NOT DISTINCT("ad_account_id","campaign_id","ad_set_id","ad_id","date")
);
--> statement-breakpoint
CREATE TABLE "assignments_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_agent_id" uuid,
	"to_agent_id" uuid,
	"reason" text,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ad_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"external_ad_set_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_set_id" uuid NOT NULL,
	"external_ad_id" text NOT NULL,
	"name" text NOT NULL,
	"creative_id" text,
	"creative_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"external_campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"loan_types" "loan_type"[] DEFAULT '{}' NOT NULL,
	"brand_ids" uuid[] DEFAULT '{}' NOT NULL,
	"telegram_group_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"role" "user_role" DEFAULT 'sales_agent' NOT NULL,
	"team_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"telegram_chat_id" text,
	"daily_capacity" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "lead_touchpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"brand_id" uuid,
	"source_platform" "source_platform" NOT NULL,
	"campaign_id" uuid,
	"ad_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"loan_type" "loan_type" NOT NULL,
	"full_name" text,
	"phone_number_raw" text,
	"normalized_phone" text,
	"email_raw" text,
	"normalized_email" text,
	"source_platform" "source_platform" NOT NULL,
	"source_channel" text,
	"landing_page_url" text,
	"keyword" text,
	"ad_account_id" uuid,
	"campaign_id" uuid,
	"ad_set_id" uuid,
	"ad_id" uuid,
	"lead_status" "lead_status" DEFAULT 'new' NOT NULL,
	"priority_level" "priority_level" DEFAULT 'warm' NOT NULL,
	"location_region" "location_region" DEFAULT 'unknown' NOT NULL,
	"assigned_agent_id" uuid,
	"assigned_team_id" uuid,
	"assigned_at" timestamp with time zone,
	"master_lead_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_contacted_at" timestamp with time zone,
	"sla_breached_at" timestamp with time zone,
	"raw_payload" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"sheet_row_id" text,
	"sheet_name" text,
	"phone_number_raw" text,
	"normalized_phone" text,
	"email_raw" text,
	"normalized_email" text,
	"agent_name_raw" text,
	"agent_id" uuid,
	"loan_type" "loan_type",
	"sales_status" "lead_status",
	"approval_status" text,
	"sales_amount" numeric(14, 2),
	"revenue_value" numeric(14, 2),
	"closed_date" date,
	"rejection_reason" text,
	"remarks" text,
	"match_confidence" "match_confidence" DEFAULT 'unmatched' NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"raw_row" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rejected_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"rejected_by_agent_id" uuid,
	"rejected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rejection_reason" "rejection_reason" NOT NULL,
	"recycle_eligible" boolean DEFAULT true NOT NULL,
	"resale_eligible" boolean DEFAULT false NOT NULL,
	"next_action" "next_action" DEFAULT 'recycle_later' NOT NULL,
	"recycled_at" timestamp with time zone,
	"recycled_to_lead_id" uuid,
	"snapshot_brand_id" uuid,
	"snapshot_loan_type" text,
	"snapshot_location_region" text,
	"snapshot_campaign_id" uuid,
	"snapshot_source_platform" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"type" "notification_type" NOT NULL,
	"lead_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"payload" jsonb,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"priority" integer NOT NULL,
	"name" text NOT NULL,
	"conditions" jsonb NOT NULL,
	"action" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sheet_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" text NOT NULL,
	"tab_name" text NOT NULL,
	"column_mapping" jsonb,
	"last_row_synced" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_jobs" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_spend" ADD CONSTRAINT "ad_spend_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_spend" ADD CONSTRAINT "ad_spend_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_spend" ADD CONSTRAINT "ad_spend_ad_set_id_ad_sets_id_fk" FOREIGN KEY ("ad_set_id") REFERENCES "public"."ad_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_spend" ADD CONSTRAINT "ad_spend_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments_history" ADD CONSTRAINT "assignments_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments_history" ADD CONSTRAINT "assignments_history_from_agent_id_users_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments_history" ADD CONSTRAINT "assignments_history_to_agent_id_users_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments_history" ADD CONSTRAINT "assignments_history_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_ad_set_id_ad_sets_id_fk" FOREIGN KEY ("ad_set_id") REFERENCES "public"."ad_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_touchpoints" ADD CONSTRAINT "lead_touchpoints_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_touchpoints" ADD CONSTRAINT "lead_touchpoints_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_touchpoints" ADD CONSTRAINT "lead_touchpoints_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_touchpoints" ADD CONSTRAINT "lead_touchpoints_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_ad_set_id_ad_sets_id_fk" FOREIGN KEY ("ad_set_id") REFERENCES "public"."ad_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_agent_id_users_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_team_id_teams_id_fk" FOREIGN KEY ("assigned_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_master_lead_id_leads_id_fk" FOREIGN KEY ("master_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejected_leads" ADD CONSTRAINT "rejected_leads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejected_leads" ADD CONSTRAINT "rejected_leads_rejected_by_agent_id_users_id_fk" FOREIGN KEY ("rejected_by_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejected_leads" ADD CONSTRAINT "rejected_leads_recycled_to_lead_id_leads_id_fk" FOREIGN KEY ("recycled_to_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_accounts_platform_external_account_uq" ON "ad_accounts" USING btree ("platform","external_account_id");--> statement-breakpoint
CREATE INDEX "ad_spend_date_idx" ON "ad_spend" USING btree ("date");--> statement-breakpoint
CREATE INDEX "ad_spend_campaign_date_idx" ON "ad_spend" USING btree ("campaign_id","date");--> statement-breakpoint
CREATE INDEX "assignments_history_lead_idx" ON "assignments_history" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_sets_campaign_external_uq" ON "ad_sets" USING btree ("campaign_id","external_ad_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ads_ad_set_external_uq" ON "ads" USING btree ("ad_set_id","external_ad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_ad_account_external_uq" ON "campaigns" USING btree ("ad_account_id","external_campaign_id");--> statement-breakpoint
CREATE INDEX "leads_normalized_phone_idx" ON "leads" USING btree ("normalized_phone");--> statement-breakpoint
CREATE INDEX "leads_normalized_email_idx" ON "leads" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "leads_brand_submitted_idx" ON "leads" USING btree ("brand_id","submitted_at");--> statement-breakpoint
CREATE INDEX "leads_agent_status_idx" ON "leads" USING btree ("assigned_agent_id","lead_status");--> statement-breakpoint
CREATE INDEX "leads_campaign_idx" ON "leads" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "leads_master_lead_idx" ON "leads" USING btree ("master_lead_id");--> statement-breakpoint
CREATE INDEX "sales_records_normalized_phone_idx" ON "sales_records" USING btree ("normalized_phone");--> statement-breakpoint
CREATE INDEX "sales_records_lead_id_idx" ON "sales_records" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "sales_records_synced_at_idx" ON "sales_records" USING btree ("synced_at");--> statement-breakpoint
CREATE INDEX "rejected_leads_reason_idx" ON "rejected_leads" USING btree ("rejection_reason");--> statement-breakpoint
CREATE INDEX "rejected_leads_rejected_at_idx" ON "rejected_leads" USING btree ("rejected_at");--> statement-breakpoint
CREATE INDEX "rejected_leads_recycle_eligible_idx" ON "rejected_leads" USING btree ("recycle_eligible");--> statement-breakpoint
CREATE UNIQUE INDEX "sheet_sync_state_sheet_tab_uq" ON "sheet_sync_state" USING btree ("sheet_id","tab_name");