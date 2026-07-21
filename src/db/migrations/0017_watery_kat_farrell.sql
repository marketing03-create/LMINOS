ALTER TYPE "public"."user_role" ADD VALUE 'live_streamer';--> statement-breakpoint
ALTER TABLE "tiktok_accounts" ADD COLUMN "assigned_streamer_id" uuid;--> statement-breakpoint
ALTER TABLE "tiktok_accounts" ADD CONSTRAINT "tiktok_accounts_assigned_streamer_id_users_id_fk" FOREIGN KEY ("assigned_streamer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;