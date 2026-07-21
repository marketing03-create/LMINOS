CREATE TABLE "tiktok_screenshot_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploader_user_id" uuid,
	"storage_path" text NOT NULL,
	"media_type" text,
	"ai_read_values" jsonb,
	"detected_date" text,
	"detected_handle" text,
	"detected_tab" text,
	"applied_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tiktok_screenshot_uploads" ADD CONSTRAINT "tiktok_screenshot_uploads_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_screenshot_uploads" ADD CONSTRAINT "tiktok_screenshot_uploads_applied_session_id_tiktok_live_sessions_id_fk" FOREIGN KEY ("applied_session_id") REFERENCES "public"."tiktok_live_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tiktok_screenshot_uploads_created_idx" ON "tiktok_screenshot_uploads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tiktok_screenshot_uploads_uploader_idx" ON "tiktok_screenshot_uploads" USING btree ("uploader_user_id");