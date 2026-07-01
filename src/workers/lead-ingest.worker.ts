import { Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "@/db/client";
import { adAccounts } from "@/db/schema";
import { decryptToken } from "@/lib/crypto/envelope";
import { adaptGoogle } from "@/lib/ingest/adapters/google";
import { adaptMeta } from "@/lib/ingest/adapters/meta";
import { adaptTiktok } from "@/lib/ingest/adapters/tiktok";
import { adaptWebsite } from "@/lib/ingest/adapters/website";
import {
  IngestError,
  insertLead,
  normalizeInbound,
  type NormalizedLead,
} from "@/lib/ingest/repository";
import type { InboundLead } from "@/lib/ingest/schema";
import { fetchMetaLead } from "@/lib/meta/graph";
import { getRedis } from "@/lib/queue/connection";
import { claimIdempotencyKey } from "@/lib/queue/idempotency";
import {
  QUEUE_NAMES,
  enqueueLeadDedupe,
  type LeadIngestJob,
} from "@/lib/queue/queues";

type Source = NormalizedLead["sourcePlatform"];

async function adapt(
  source: Source,
  payload: unknown
): Promise<InboundLead> {
  switch (source) {
    case "website":
    case "csv_import":
      // CSV rows are pre-shaped into canonical form by the upload endpoint.
      return adaptWebsite(payload);
    case "google":
      return adaptGoogle(payload);
    case "tiktok":
      return adaptTiktok(payload);
    case "meta":
      return await adaptMetaWithFetch(payload);
    case "referral":
    case "manual":
      return adaptWebsite(payload);
    default: {
      const _exhaustive: never = source;
      throw new IngestError(
        `unsupported_source: ${String(_exhaustive)}`,
        "unsupported_source"
      );
    }
  }
}

async function adaptMetaWithFetch(payload: unknown): Promise<InboundLead> {
  const p = payload as { leadgen_id?: string; page_id?: string };
  if (!p?.leadgen_id) {
    throw new IngestError("meta payload missing leadgen_id", "invalid_payload");
  }

  // Resolve page → ad_account → access token.
  // For Phase 1 we accept either a per-page mapping in env (META_PAGE_TOKEN_<pageId>)
  // OR a single META_PAGE_ACCESS_TOKEN fallback. Per-page tokens stored
  // encrypted on ad_accounts will be wired in Phase 1.5 once the brand/account
  // inventory is loaded.
  const pageToken =
    (p.page_id ? process.env[`META_PAGE_TOKEN_${p.page_id}`] : undefined) ??
    process.env.META_PAGE_ACCESS_TOKEN ??
    (await tryDecryptStoredToken("meta", p.page_id));

  if (!pageToken) {
    throw new IngestError(
      `no Meta page access token for page ${p.page_id ?? "unknown"}`,
      "missing_token"
    );
  }

  const fetched = await fetchMetaLead(p.leadgen_id, pageToken);
  return adaptMeta(fetched, p.page_id);
}

async function tryDecryptStoredToken(
  platform: "meta" | "google" | "tiktok",
  externalAccountId: string | undefined
): Promise<string | undefined> {
  if (!externalAccountId) return undefined;
  try {
    const acct = await db.query.adAccounts.findFirst({
      where: and(
        eq(adAccounts.platform, platform),
        eq(adAccounts.externalAccountId, externalAccountId)
      ),
    });
    if (!acct?.accessTokenEncrypted) return undefined;
    return decryptToken(acct.accessTokenEncrypted);
  } catch (err) {
    console.warn(
      `[lead.ingest] failed to load stored token for ${platform}:${externalAccountId}:`,
      err
    );
    return undefined;
  }
}

export function startLeadIngestWorker() {
  const worker = new Worker<LeadIngestJob>(
    QUEUE_NAMES.LEAD_INGEST,
    async (job) => {
      const { idempotencyKey, sourcePlatform, payload } = job.data;

      // 1. Adapt + Zod-validate (catch shape errors before touching DB).
      let canonical: InboundLead;
      try {
        canonical = await adapt(sourcePlatform as Source, payload);
      } catch (err) {
        if (err instanceof ZodError) {
          console.error(
            `[lead.ingest] zod failed for ${idempotencyKey}:`,
            err.flatten()
          );
        } else if (err instanceof IngestError) {
          console.error(
            `[lead.ingest] ${err.code} for ${idempotencyKey}: ${err.message}`
          );
        } else if (err instanceof Error) {
          console.error(
            `[lead.ingest] adapt failed for ${idempotencyKey}:`,
            err.stack ?? err.message
          );
        } else {
          console.error(
            `[lead.ingest] adapt failed for ${idempotencyKey} (non-Error):`,
            err
          );
        }
        throw err;
      }

      // 2. Idempotency claim — AFTER validation, BEFORE side-effects.
      // Retries on transient DB errors won't be locked out because the claim
      // only sticks once we reach this point with a valid payload. If the
      // INSERT below fails, the claim remains and we skip on retry; the
      // tradeoff: data loss is preferred over duplicate inserts. Adjust if
      // your operational risk tolerance differs.
      const first = await claimIdempotencyKey(idempotencyKey, "lead.ingest");
      if (!first) {
        console.log(`[lead.ingest] skip duplicate ${idempotencyKey}`);
        return { skipped: true };
      }

      // 3. Normalize + brand resolution.
      let normalized: NormalizedLead;
      try {
        normalized = await normalizeInbound(canonical, {
          sourcePlatform: sourcePlatform as Source,
          rawPayload: payload,
        });
      } catch (err) {
        if (err instanceof IngestError) {
          console.error(
            `[lead.ingest] normalize ${err.code} for ${idempotencyKey}: ${err.message}`
          );
        } else if (err instanceof Error) {
          console.error(
            `[lead.ingest] normalize failed for ${idempotencyKey}:`,
            err.stack ?? err.message
          );
        }
        throw err;
      }

      // 4. Insert.
      let leadId: string;
      try {
        leadId = await insertLead(normalized);
      } catch (err) {
        console.error(
          `[lead.ingest] insertLead failed for ${idempotencyKey}:`,
          err instanceof Error ? (err.stack ?? err.message) : err
        );
        throw err;
      }
      console.log(`[lead.ingest] inserted lead ${leadId} from ${sourcePlatform}`);

      // 5. Fan out to dedupe.
      await enqueueLeadDedupe({ leadId });
      return { leadId };
    },
    { connection: getRedis(), concurrency: 8 }
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[lead.ingest] job ${job?.id} failed (attempt ${job?.attemptsMade}):`,
      err.message
    );
  });

  return worker;
}
