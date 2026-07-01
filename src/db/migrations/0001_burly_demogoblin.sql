ALTER TABLE "leads" ADD COLUMN "external_record_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_external_record_id_uq" ON "leads" USING btree ("external_record_id");