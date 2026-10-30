CREATE TABLE "tiktok_wa_links" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"channel_phone" text,
	"code" text,
	"auto_fill_total_leads" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wati_connections" ADD COLUMN "last_event_keys" text[];--> statement-breakpoint
ALTER TABLE "wati_connections" ADD COLUMN "replies_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wati_connections" ADD COLUMN "missed_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN "first_reply_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN "first_reply_by" text;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN "missed_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tiktok_wa_links" ADD CONSTRAINT "tiktok_wa_links_account_id_tiktok_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."tiktok_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_wa_links" ADD CONSTRAINT "tiktok_wa_links_connection_id_wati_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."wati_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tiktok_wa_links_code_uq" ON "tiktok_wa_links" USING btree ("code");--> statement-breakpoint
-- RLS on, no policies — same as 0036: only the app's own role touches it.
ALTER TABLE "tiktok_wa_links" ENABLE ROW LEVEL SECURITY;
