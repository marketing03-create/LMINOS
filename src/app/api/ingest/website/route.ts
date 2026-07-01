import { NextResponse, type NextRequest } from "next/server";
import { verifyHmacSha256Hex } from "@/lib/crypto/hmac";
import {
  bodyHash,
  buildIdempotencyKey,
} from "@/lib/queue/idempotency";
import { enqueueLeadIngest } from "@/lib/queue/queues";

/**
 * Website lead ingest webhook.
 *
 * Contract:
 *   Method: POST
 *   Header: X-LMIROS-Signature: sha256=<hex>   (HMAC-SHA256 over the raw body)
 *   Body  : JSON. Required: brand_slug, loan_type, phone. Optional: full_name,
 *           email, campaign_name, ad_set_name, ad_name, creative_id, keyword,
 *           landing_page_url, source_channel, location, notes.
 *
 * Never returns non-200 to the caller — caller-visible failures only happen
 * on signature mismatch (401) or invalid JSON (400). Worker validation
 * failures land in dead-letter and are replayed from the admin UI.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-lmiros-signature");

  const secret = process.env.WEBHOOK_SECRET_WEBSITE;
  if (!secret) {
    console.error("[ingest/website] WEBHOOK_SECRET_WEBSITE not configured");
    return new NextResponse("server misconfigured", { status: 500 });
  }

  if (!verifyHmacSha256Hex(secret, rawBody, signature)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  // Idempotency key derived from body hash so identical replays are no-ops.
  const externalId =
    typeof payload === "object" && payload !== null && "external_id" in payload
      ? String((payload as Record<string, unknown>).external_id ?? "")
      : "";
  const hash = await bodyHash(rawBody);
  const idempotencyKey = buildIdempotencyKey({
    source: "website",
    externalId: externalId || undefined,
    bodyHash: hash,
  });

  try {
    await enqueueLeadIngest({
      idempotencyKey,
      sourcePlatform: "website",
      receivedAt: new Date().toISOString(),
      payload,
    });
  } catch (err) {
    // Never fail the upstream caller — log + acknowledge.
    console.error("[ingest/website] enqueue failed:", err);
  }

  return NextResponse.json({ ok: true, idempotency_key: idempotencyKey });
}
