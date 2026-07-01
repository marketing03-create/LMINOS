-- Custom SQL migration file, put your code below! --

-- Enable Row-Level Security (RLS) on every table in the public schema.
--
-- WHY: Supabase exposes public-schema tables through its auto-generated REST
-- API (PostgREST) to the public `anon` / `authenticated` roles. With RLS OFF,
-- anyone holding the public anon key (which ships in the browser bundle) could
-- read / edit / delete data via that API — this is the "rls_disabled_in_public"
-- security advisory. Enabling RLS with NO policies = deny-all for those roles,
-- which fully closes that public API surface.
--
-- SAFE FOR THE APP: LMIROS reads/writes the database through the privileged
-- `postgres` connection (DATABASE_URL) — the table OWNER, which BYPASSES RLS
-- because we do NOT FORCE row-level security. The Supabase auth signup trigger
-- is SECURITY DEFINER and likewise bypasses RLS. App-layer RBAC stays the real
-- authorization gate (src/lib/auth/authorize.ts). So enabling RLS changes
-- nothing for the dashboard, syncs, or workers — it only blocks the anon REST
-- API we never use.
--
-- Dynamic over pg_tables so it covers all current tables (incl. ad_proposals)
-- and is safe to re-run (ENABLE is idempotent).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
