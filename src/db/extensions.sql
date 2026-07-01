-- Required Postgres extensions for LMIROS.
-- Run once against the Supabase database before drizzle-kit push/migrate.
-- (Or paste into Supabase SQL editor.)

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive text for emails
create extension if not exists "pg_trgm";    -- trigram fuzzy matching for names
