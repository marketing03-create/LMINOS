import { NextResponse, type NextRequest } from "next/server";
import { parseSpendCsv } from "@/lib/spend/parse";
import { importSpendRows } from "@/lib/spend/import";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/**
 * Weekly spend CSV upload. Admin auth required.
 *
 * Response payload tells the user exactly which rows succeeded/updated/skipped
 * with per-row error messages, so they can fix the CSV and re-upload.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });
  const actorId = auth.userId;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "missing file part" },
      { status: 400 }
    );
  }

  const text = await file.text();
  const { results, okCount, errorCount } = parseSpendCsv(text);

  const validRows = results
    .filter((r): r is Extract<typeof r, { ok: true }> => r.ok)
    .map((r) => ({ row: r.row, data: r.data }));

  const importRes = await importSpendRows(validRows);

  await writeAudit({
    actorUserId: actorId,
    eventType: "spend.imported",
    entityType: "ad_spend_batch",
    entityId: `${Date.now()}`,
    after: {
      file_name: file.name,
      total_rows: results.length,
      parse_ok: okCount,
      parse_errors: errorCount,
      inserted: importRes.inserted,
      updated: importRes.updated,
      skipped: importRes.skipped,
    },
  });

  return NextResponse.json({
    ok: true,
    file_name: file.name,
    total_rows: results.length,
    parse_ok: okCount,
    parse_errors: errorCount,
    ...importRes,
    parse_error_detail: results
      .filter((r): r is Extract<typeof r, { ok: false }> => !r.ok)
      .slice(0, 20)
      .map((r) => ({ row: r.row, error: r.error })),
  });
}
