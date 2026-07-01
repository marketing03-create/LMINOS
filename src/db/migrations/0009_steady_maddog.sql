CREATE TABLE "hourly_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"date" date NOT NULL,
	"hour" integer NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" numeric(14, 2) DEFAULT '0' NOT NULL,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hourly_metrics_uq" UNIQUE("ad_account_id","date","hour")
);
--> statement-breakpoint
ALTER TABLE "hourly_metrics" ADD CONSTRAINT "hourly_metrics_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hourly_metrics_acct_date_idx" ON "hourly_metrics" USING btree ("ad_account_id","date");