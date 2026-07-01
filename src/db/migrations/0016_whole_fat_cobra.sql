CREATE TYPE "public"."ad_blueprint_risk" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."ad_blueprint_status" AS ENUM('draft', 'pending', 'approved', 'validating', 'building', 'built', 'failed', 'reverted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ad_build_step_kind" AS ENUM('create_customer_client', 'create_campaign_budget', 'create_campaign', 'create_campaign_criterion', 'create_ad_group', 'create_ad_group_criterion', 'create_ad_group_ad', 'create_conversion_action');--> statement-breakpoint
CREATE TYPE "public"."ad_build_step_status" AS ENUM('pending', 'validated', 'applied', 'failed', 'skipped', 'reverted');--> statement-breakpoint
CREATE TABLE "ad_blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid,
	"website_id" uuid,
	"account_source" text DEFAULT 'existing' NOT NULL,
	"status" "ad_blueprint_status" DEFAULT 'draft' NOT NULL,
	"risk_tier" "ad_blueprint_risk" DEFAULT 'high' NOT NULL,
	"title" text NOT NULL,
	"blueprint" jsonb NOT NULL,
	"daily_budget_myr" numeric,
	"rationale" text,
	"model_used" text,
	"external_customer_id" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"validated_at" timestamp with time zone,
	"built_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_build_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" "ad_build_step_kind" NOT NULL,
	"status" "ad_build_step_status" DEFAULT 'pending' NOT NULL,
	"request_payload" jsonb NOT NULL,
	"resource_name" text,
	"response_payload" jsonb,
	"error" text,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_blueprints" ADD CONSTRAINT "ad_blueprints_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_blueprints" ADD CONSTRAINT "ad_blueprints_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_blueprints" ADD CONSTRAINT "ad_blueprints_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_build_steps" ADD CONSTRAINT "ad_build_steps_blueprint_id_ad_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."ad_blueprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_blueprints_status_created_idx" ON "ad_blueprints" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ad_blueprints_account_idx" ON "ad_blueprints" USING btree ("ad_account_id");--> statement-breakpoint
CREATE INDEX "ad_build_steps_blueprint_seq_idx" ON "ad_build_steps" USING btree ("blueprint_id","seq");