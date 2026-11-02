CREATE TABLE "wati_daily_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"day" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"wati_customers" integer DEFAULT 0 NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"missing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"not_customers" integer DEFAULT 0 NOT NULL,
	"unchecked" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "wati_daily_checks" ADD CONSTRAINT "wati_daily_checks_connection_id_wati_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."wati_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wati_daily_checks_uq" ON "wati_daily_checks" USING btree ("connection_id","day");--> statement-breakpoint
-- RLS on, no policies — same as 0036: only the app's own role touches it.
ALTER TABLE "wati_daily_checks" ENABLE ROW LEVEL SECURITY;
