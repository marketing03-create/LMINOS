import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseLeadsCsv } from "@/lib/ingest/adapters/csv";
import { bodyHash, buildIdempotencyKey } from "@/lib/queue/idempotency";
import { enqueueLeadIngest } from "@/lib/queue/queues";

/**
 * Staff-only CSV import. Multipart upload with a single `file` part.
 *
 * NOTE: this route sits under /api/ingest/* which proxy.ts marks as public
 * (so external webhooks can be signature-verified instead of auth'd). We
 * therefore re-check the Supabase session inside the handler.
 */
export async function POST(request: NextRequest) {
  if (process.env.LMIROS_DEV_BYPASS_AUTH !== "true") {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new NextResponse("unauthorized", { status: 401 });
    }
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "missing file part" },
      { status: 400 }
    );
  }

  const text = await file.text();
  const { results, okCount, errorCount } = parseLeadsCsv(text);

  // Enqueue valid rows. Idempotency key = sha256(file body) + row number so
  // re-uploading the same CSV is a no-op per-row.
  const fileHash = await bodyHash(text);
  let enqueued = 0;
  for (const r of results) {
    if (!r.ok) continue;
    const idempotencyKey = buildIdempotencyKey({
      source: "csv",
      externalId: `${fileHash}:${r.row}`,
    });
    try {
      await enqueueLeadIngest({
        idempotencyKey,
        sourcePlatform: "csv_import",
        receivedAt: new Date().toISOString(),
        payload: r.lead,
      });
      enqueued++;
    } catch (err) {
      console.error("[ingest/csv] enqueue failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    file_hash: fileHash,
    total_rows: results.length,
    enqueued,
    skipped: errorCount,
    errors: results
      .filter((r): r is Extract<typeof r, { ok: false }> => !r.ok)
      .map((r) => ({ row: r.row, error: r.error, raw: r.raw })),
  });
}
