CREATE TABLE "wati_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"webhook_key" text NOT NULL,
	"api_endpoint" text,
	"api_token_enc" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_event_at" timestamp with time zone,
	"last_event_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wati_connections_webhook_key_unique" UNIQUE("webhook_key")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"channel_phone" text,
	"first_message_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"first_message_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_connection_id_wati_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."wati_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_contacts_uq" ON "whatsapp_contacts" USING btree ("connection_id","phone");--> statement-breakpoint
CREATE INDEX "whatsapp_contacts_first_idx" ON "whatsapp_contacts" USING btree ("first_message_at");--> statement-breakpoint
-- RLS on, no policies — same as 0034: only the app's own `postgres` role
-- (BYPASSRLS) touches these, never the public anon key. Customer phone numbers
-- are personal data (PDPA).
ALTER TABLE "wati_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ENABLE ROW LEVEL SECURITY;
