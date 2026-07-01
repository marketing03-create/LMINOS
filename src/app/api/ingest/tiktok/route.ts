import { NextResponse, type NextRequest } from "next/server";
import { verifyHmacSha256Hex } from "@/lib/crypto/hmac";
import { bodyHash, buildIdempotencyKey } from "@/lib/queue/idempotency";
import { enqueueLeadIngest } from "@/lib/queue/queues";

/**
 * TikTok Lead Generation webhook.
 *
 * Verification: HMAC-SHA256 of raw body using the app secret, sent in
 * the `X-Sig` header. Some TikTok rollouts use `X-Tt-Signature` — accept both.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const sig =
    request.headers.get("x-sig") ?? request.headers.get("x-tt-signature");

  const secret = process.env.TIKTOK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[ingest/tiktok] TIKTOK_WEBHOOK_SECRET not configured");
    return new NextResponse("server misconfigured", { status: 500 });
  }

  if (!verifyHmacSha256Hex(secret, raw, sig)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let payload: { lead_id?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const externalId = payload.lead_id ?? (await bodyHash(raw));
  const idempotencyKey = buildIdempotencyKey({
    source: "tiktok",
    externalId,
  });

  try {
    await enqueueLeadIngest({
      idempotencyKey,
      sourcePlatform: "tiktok",
      receivedAt: new Date().toISOString(),
      payload,
    });
  } catch (err) {
    console.error("[ingest/tiktok] enqueue failed:", err);
  }

  return NextResponse.json({ ok: true, idempotency_key: idempotencyKey });
}
