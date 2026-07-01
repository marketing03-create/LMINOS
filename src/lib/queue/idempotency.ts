import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { processedJobs } from "@/db/schema";

/**
 * Insert into processed_jobs as a guard against duplicate processing.
 * Returns true if this is the FIRST time we've seen this key (proceed),
 * false if we've already processed it (skip).
 *
 * Uses ON CONFLICT DO NOTHING so two workers racing on the same key
 * can both call this safely; only one gets `true`.
 */
export async function claimIdempotencyKey(
  key: string,
  jobType: string
): Promise<boolean> {
  const result = await db
    .insert(processedJobs)
    .values({ idempotencyKey: key, jobType })
    .onConflictDoNothing()
    .returning({ key: processedJobs.idempotencyKey });

  return result.length > 0;
}

/**
 * Build a deterministic idempotency key. Workers re-derive the same key
 * for the same source event so duplicate webhooks are no-ops.
 */
export function buildIdempotencyKey(parts: {
  source: string; // "website" | "meta" | "google" | "tiktok"
  externalId?: string; // platform-supplied lead id when available
  bodyHash?: string; // sha256(raw body) fallback
}): string {
  const id = parts.externalId ?? parts.bodyHash ?? "";
  return `${parts.source}:${id}`;
}

export async function bodyHash(body: string): Promise<string> {
  const enc = new TextEncoder().encode(body);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
