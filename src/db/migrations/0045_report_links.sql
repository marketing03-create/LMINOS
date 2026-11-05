CREATE TABLE "report_links" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_links_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "report_links" ADD CONSTRAINT "report_links_account_id_tiktok_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."tiktok_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- RLS on, no policies — only the app's own role reads it (same as 0036).
ALTER TABLE "report_links" ENABLE ROW LEVEL SECURITY;
