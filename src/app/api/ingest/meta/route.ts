import { NextResponse, type NextRequest } from "next/server";
import { verifyHmacSha256Hex } from "@/lib/crypto/hmac";
import { metaWebhookEventSchema } from "@/lib/ingest/adapters/meta";
import { bodyHash, buildIdempotencyKey } from "@/lib/queue/idempotency";
import { enqueueLeadIngest } from "@/lib/queue/queues";

/**
 * Meta (Facebook + Instagram) Lead Ads webhook.
 *
 * GET  — Subscription verification challenge. Meta sends ?hub.mode=subscribe&
 *        hub.verify_token=...&hub.challenge=...; we echo the challenge back as
 *        text iff the token matches META_VERIFY_TOKEN.
 *
 * POST — Lead notification. Body is signed with HMAC-SHA256(app_secret) in the
 *        X-Hub-Signature-256 header. Payload contains a leadgen_id; the worker
 *        fetches actual field data via the Graph API.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expected = process.env.META_VERIFY_TOKEN;
  if (mode === "subscribe" && token && expected && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("verification failed", { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error("[ingest/meta] META_APP_SECRET not configured");
    return new NextResponse("server misconfigured", { status: 500 });
  }

  if (!verifyHmacSha256Hex(secret, raw, signature)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let parsed;
  try {
    parsed = metaWebhookEventSchema.parse(JSON.parse(raw));
  } catch (err) {
    console.error("[ingest/meta] payload validation failed:", err);
    // Still return 200 so Meta doesn't retry; dead-letter via logs.
    return NextResponse.json({ ok: true, parsed: false });
  }

  // A single webhook can carry multiple lead events (multiple entries × multiple changes).
  // Enqueue one job per leadgen_id so workers can fetch + process in parallel.
  let enqueued = 0;
  for (const entry of parsed.entry) {
    for (const change of entry.changes) {
      const leadgenId = change.value.leadgen_id;
      const pageId = entry.id;
      const idempotencyKey = buildIdempotencyKey({
        source: "meta",
        externalId: leadgenId,
      });
      try {
        await enqueueLeadIngest({
          idempotencyKey,
          sourcePlatform: "meta",
          receivedAt: new Date().toISOString(),
          payload: {
            leadgen_id: leadgenId,
            page_id: pageId,
            form_id: change.value.form_id,
            ad_id: change.value.ad_id,
            adgroup_id: change.value.adgroup_id,
            created_time: change.value.created_time,
          },
        });
        enqueued++;
      } catch (err) {
        console.error(`[ingest/meta] enqueue failed for ${leadgenId}:`, err);
      }
    }
  }

  if (enqueued === 0) {
    // Body hash for opaque events Meta sometimes sends.
    const idempotencyKey = buildIdempotencyKey({
      source: "meta",
      externalId: await bodyHash(raw),
    });
    return NextResponse.json({ ok: true, enqueued: 0, idempotency_key: idempotencyKey });
  }

  return NextResponse.json({ ok: true, enqueued });
}
