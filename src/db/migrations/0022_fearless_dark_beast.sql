CREATE TABLE "removed_users" (
	"email" text PRIMARY KEY NOT NULL,
	"removed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by_user_id" uuid,
	"note" text
);
--> statement-breakpoint
-- RLS on (deny-all to anon/authenticated; the app uses the owner connection
-- which bypasses RLS). Keeps parity with migration 0014 + the Supabase advisory.
ALTER TABLE "removed_users" ENABLE ROW LEVEL SECURITY;
