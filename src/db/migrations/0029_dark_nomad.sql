CREATE TABLE "user_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"session_ids" text[],
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_notifications_inbox_idx" ON "user_notifications" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_notifications_dedupe_uniq" ON "user_notifications" USING btree ("user_id","type","dedupe_key");--> statement-breakpoint
-- Consistent with 0014: RLS on (the app reads via the owner connection, which
-- bypasses RLS; with no policies, all anon/authenticated client access is denied).
ALTER TABLE "user_notifications" ENABLE ROW LEVEL SECURITY;