CREATE TABLE "tiktok_live_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"comment_text" text,
	"commented_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tiktok_accounts" ADD COLUMN "lead_keywords" text[];--> statement-breakpoint
ALTER TABLE "tiktok_live_sessions" ADD COLUMN "keyword_leads" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tiktok_live_leads" ADD CONSTRAINT "tiktok_live_leads_session_id_tiktok_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tiktok_live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_live_leads" ADD CONSTRAINT "tiktok_live_leads_account_id_tiktok_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."tiktok_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tiktok_live_leads_uq" ON "tiktok_live_leads" USING btree ("session_id","username");--> statement-breakpoint
CREATE INDEX "tiktok_live_leads_session_idx" ON "tiktok_live_leads" USING btree ("session_id");