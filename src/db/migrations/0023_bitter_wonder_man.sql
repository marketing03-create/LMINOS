ALTER TABLE "tiktok_live_sessions" ADD COLUMN "products" text[];
--> statement-breakpoint
-- Backfill the new multi-value column from the legacy single `product`.
-- The old combined "KK/Koperasi" tag splits into two separate products.
UPDATE "tiktok_live_sessions" SET "products" = CASE
  WHEN "product" IS NULL OR "product" = '' THEN NULL
  WHEN "product" = 'KK/Koperasi' THEN ARRAY['KK','Koperasi']
  ELSE ARRAY["product"]
END;