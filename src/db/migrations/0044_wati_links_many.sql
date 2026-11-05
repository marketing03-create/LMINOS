-- A TikTok handle can now link several WATI accounts / numbers: one row per
-- handle + account + number instead of one per handle. No rows change.
DROP INDEX "tiktok_wa_links_code_uq";--> statement-breakpoint
ALTER TABLE "tiktok_wa_links" DROP CONSTRAINT "tiktok_wa_links_pkey";--> statement-breakpoint
ALTER TABLE "tiktok_wa_links" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE INDEX "tiktok_wa_links_account_idx" ON "tiktok_wa_links" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "tiktok_wa_links" ADD CONSTRAINT "tiktok_wa_links_uq" UNIQUE NULLS NOT DISTINCT("account_id","connection_id","channel_phone");
