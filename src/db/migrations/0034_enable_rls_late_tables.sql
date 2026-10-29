-- Row Level Security for the two tables created after 0014 turned it on for
-- everything else. With RLS off, Supabase's REST API let the public anon key
-- (shipped to every browser) read and write them. No policies on purpose:
-- only the app's own `postgres` role (BYPASSRLS) touches these tables.
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tiktok_screenshot_uploads" ENABLE ROW LEVEL SECURITY;
