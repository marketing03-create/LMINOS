import { pgTable, text } from "drizzle-orm/pg-core";
import { createdAt } from "./columns";

// Idempotency table for queue workers.
// Workers INSERT ... ON CONFLICT DO NOTHING keyed by idempotency_key
// before doing any work, so duplicate webhooks are no-ops.
export const processedJobs = pgTable("processed_jobs", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  jobType: text("job_type").notNull(),
  createdAt: createdAt(),
});
