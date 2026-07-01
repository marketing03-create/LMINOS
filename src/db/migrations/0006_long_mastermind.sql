ALTER TABLE "ad_spend" ADD COLUMN "conversions" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_spend" ADD COLUMN "conversion_value" numeric(14, 2) DEFAULT '0' NOT NULL;