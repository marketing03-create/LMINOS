CREATE TABLE "whatsapp_chat_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"day" text NOT NULL,
	"channel_phone" text,
	"first_at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_chat_days_uq" UNIQUE NULLS NOT DISTINCT("contact_id","day","channel_phone")
);
--> statement-breakpoint
ALTER TABLE "whatsapp_chat_days" ADD CONSTRAINT "whatsapp_chat_days_contact_id_whatsapp_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."whatsapp_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_chat_days_day_idx" ON "whatsapp_chat_days" USING btree ("day");--> statement-breakpoint
-- RLS on, no policies — only the app's own role reads it (same as 0036).
ALTER TABLE "whatsapp_chat_days" ENABLE ROW LEVEL SECURITY;
