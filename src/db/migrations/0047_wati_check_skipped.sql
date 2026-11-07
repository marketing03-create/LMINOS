ALTER TABLE "wati_daily_checks" ADD COLUMN "skipped" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wati_daily_checks" ADD COLUMN "skipped_info" jsonb;