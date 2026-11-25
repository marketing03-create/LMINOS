CREATE TABLE "tiktok_dm_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"channel_id" text NOT NULL,
	"account_id" uuid,
	"label" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tiktok_dm_channels_uq" UNIQUE("connection_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "tiktok_dm_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"channel_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"name" text,
	"first_message_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"first_message_text" text,
	"latest_message_text" text,
	"latest_message_at" timestamp with time zone,
	"latest_message_from" text,
	"first_reply_at" timestamp with time zone,
	"first_reply_by" text,
	"wati_conversation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tiktok_dm_contacts_uq" UNIQUE("connection_id","channel_id","sender_id")
);
--> statement-breakpoint
CREATE TABLE "tiktok_dm_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"day" text NOT NULL,
	"first_at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tiktok_dm_days_uq" UNIQUE("contact_id","day")
);
--> statement-breakpoint
CREATE TABLE "wati_unknown_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"signature" text NOT NULL,
	"event_type" text,
	"shape" jsonb NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "wati_unknown_events_uq" UNIQUE("connection_id","signature")
);
--> statement-breakpoint
ALTER TABLE "tiktok_dm_channels" ADD CONSTRAINT "tiktok_dm_channels_connection_id_wati_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."wati_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_dm_channels" ADD CONSTRAINT "tiktok_dm_channels_account_id_tiktok_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."tiktok_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_dm_contacts" ADD CONSTRAINT "tiktok_dm_contacts_connection_id_wati_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."wati_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_dm_days" ADD CONSTRAINT "tiktok_dm_days_contact_id_tiktok_dm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."tiktok_dm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wati_unknown_events" ADD CONSTRAINT "wati_unknown_events_connection_id_wati_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."wati_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tiktok_dm_contacts_first_idx" ON "tiktok_dm_contacts" USING btree ("first_message_at");--> statement-breakpoint
CREATE INDEX "tiktok_dm_days_day_idx" ON "tiktok_dm_days" USING btree ("day");--> statement-breakpoint
-- RLS on, no policies — only the app's own role reads these (same as 0036).
ALTER TABLE "tiktok_dm_channels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tiktok_dm_contacts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tiktok_dm_days" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "wati_unknown_events" ENABLE ROW LEVEL SECURITY;
