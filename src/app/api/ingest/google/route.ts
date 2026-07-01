import { NextResponse, type NextRequest } from "next/server";
import { bodyHash, buildIdempotencyKey } from "@/lib/queue/idempotency";
import { enqueueLeadIngest } from "@/lib/queue/queues";

/**
 * Google Ads Lead Form webhook.
 *
 * Verification: Google does not sign requests. Instead, the `google_key` in
 * the body must match a shared secret you configure here (and register in
 * the Google Ads UI).
 *
 * https://developers.google.com/google-ads/lead-form-extensions/integrating-crm
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const expectedKey = process.env.GOOGLE_ADS_WEBHOOK_TOKEN;
  if (!expectedKey) {
    console.error("[ingest/google] GOOGLE_ADS_WEBHOOK_TOKEN not configured");
    return new NextResponse("server misconfigured", { status: 500 });
  }

  let payload: { google_key?: string; lead_id?: string; is_test?: boolean };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  if (payload.google_key !== expectedKey) {
    return new NextResponse("invalid key", { status: 401 });
  }

  // Suppress Google's test webhook so we don't pollute the lead table.
  if (payload.is_test === true) {
    return NextResponse.json({ ok: true, test: true });
  }

  const externalId = payload.lead_id ?? (await bodyHash(raw));
  const idempotencyKey = buildIdempotencyKey({
    source: "google",
    externalId,
  });

  try {
    await enqueueLeadIngest({
      idempotencyKey,
      sourcePlatform: "google",
      receivedAt: new Date().toISOString(),
      payload,
    });
  } catch (err) {
    console.error("[ingest/google] enqueue failed:", err);
  }

  return NextResponse.json({ ok: true, idempotency_key: idempotencyKey });
}
