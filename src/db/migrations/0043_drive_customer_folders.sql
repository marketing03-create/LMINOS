CREATE TABLE "customer_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"session_id" uuid,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"shared_drive_id" text NOT NULL,
	"folder_id" text,
	"subfolders" jsonb,
	"file_counts" jsonb,
	"total_files" integer DEFAULT 0 NOT NULL,
	"files_checked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_day_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shared_drive_id" text NOT NULL,
	"day" text NOT NULL,
	"folder_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_email" text NOT NULL,
	"private_key_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiktok_drive_links" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"shared_drive_id" text NOT NULL,
	"shared_drive_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tiktok_live_sessions" ADD COLUMN "docs_auto_count" integer;--> statement-breakpoint
ALTER TABLE "customer_folders" ADD CONSTRAINT "customer_folders_account_id_tiktok_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."tiktok_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_folders" ADD CONSTRAINT "customer_folders_session_id_tiktok_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tiktok_live_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_folders" ADD CONSTRAINT "customer_folders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_drive_links" ADD CONSTRAINT "tiktok_drive_links_account_id_tiktok_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."tiktok_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_folders_phone_uq" ON "customer_folders" USING btree ("account_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_day_folders_uq" ON "drive_day_folders" USING btree ("shared_drive_id","day");--> statement-breakpoint
-- RLS on, no policies — same as 0036: only the app's own role touches them.
ALTER TABLE "customer_folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drive_day_folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drive_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tiktok_drive_links" ENABLE ROW LEVEL SECURITY;
