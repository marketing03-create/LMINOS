CREATE TABLE "worker_heartbeats" (
	"name" text PRIMARY KEY NOT NULL,
	"last_beat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
-- Consistent with 0014: RLS on (app reads via the owner connection which
-- bypasses RLS; no policies = all client/anon access denied).
ALTER TABLE "worker_heartbeats" ENABLE ROW LEVEL SECURITY;
