CREATE TABLE "app_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"handle" text,
	"href" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "app_notifications_created_idx" ON "app_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "app_notifications_dedupe_uniq" ON "app_notifications" USING btree ("type","dedupe_key");--> statement-breakpoint
-- Consistent with 0014: RLS on (app reads via the owner connection, which
-- bypasses RLS; with no policies, all client/anon access is denied).
ALTER TABLE "app_notifications" ENABLE ROW LEVEL SECURITY;