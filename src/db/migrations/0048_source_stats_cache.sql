CREATE TABLE "source_stats_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
-- Server-only table (read via the pooled DB role): no PostgREST access.
ALTER TABLE "source_stats_cache" ENABLE ROW LEVEL SECURITY;
