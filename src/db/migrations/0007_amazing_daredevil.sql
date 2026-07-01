CREATE TABLE "keyword_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"campaign_external_id" text,
	"campaign_name" text,
	"ad_group_id" text DEFAULT '' NOT NULL,
	"ad_group_name" text,
	"criterion_id" text NOT NULL,
	"keyword_text" text NOT NULL,
	"match_type" text,
	"status" text,
	"date" date NOT NULL,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_metrics_uq" UNIQUE("ad_account_id","ad_group_id","criterion_id","date")
);
--> statement-breakpoint
CREATE TABLE "search_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"campaign_external_id" text DEFAULT '' NOT NULL,
	"campaign_name" text,
	"term" text NOT NULL,
	"status" text,
	"date" date NOT NULL,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_terms_uq" UNIQUE("ad_account_id","campaign_external_id","term","date")
);
--> statement-breakpoint
ALTER TABLE "keyword_metrics" ADD CONSTRAINT "keyword_metrics_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_terms" ADD CONSTRAINT "search_terms_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keyword_metrics_acct_date_idx" ON "keyword_metrics" USING btree ("ad_account_id","date");--> statement-breakpoint
CREATE INDEX "search_terms_acct_date_idx" ON "search_terms" USING btree ("ad_account_id","date");