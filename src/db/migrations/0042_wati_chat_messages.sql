ALTER TABLE "whatsapp_contacts" ADD COLUMN "latest_message_text" text;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN "latest_message_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN "latest_message_from" text;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN "latest_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN "opening_message_text" text;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN "opening_message_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN "opening_message_from" text;