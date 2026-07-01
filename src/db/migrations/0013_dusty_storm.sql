CREATE TYPE "public"."ad_proposal_risk" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."ad_proposal_status" AS ENUM('pending', 'approved', 'rejected', 'applied', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ad_proposal_type" AS ENUM('add_negative_keyword', 'pause_keyword', 'adjust_budget', 'new_ad_copy');--> statement-breakpoint
CREATE TABLE "ad_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"website_id" uuid,
	"type" "ad_proposal_type" NOT NULL,
	"status" "ad_proposal_status" DEFAULT 'pending' NOT NULL,
	"risk_tier" "ad_proposal_risk" DEFAULT 'low' NOT NULL,
	"target" text,
	"change" text NOT NULL,
	"rationale" text NOT NULL,
	"projected_impact" text,
	"confidence" text,
	"payload" jsonb,
	"before_snapshot" jsonb,
	"model_used" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_proposals" ADD CONSTRAINT "ad_proposals_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_proposals" ADD CONSTRAINT "ad_proposals_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_proposals" ADD CONSTRAINT "ad_proposals_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_proposals_account_status_idx" ON "ad_proposals" USING btree ("ad_account_id","status");--> statement-breakpoint
CREATE INDEX "ad_proposals_status_created_idx" ON "ad_proposals" USING btree ("status","created_at");