import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { bulkUpsertAccounts, parseAccountCsv } from "@/lib/ads/bulk-import";

/** Bulk-create Google Ads account rows from a pasted/uploaded CSV. Admin auth. */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { csv?: string } | null;
  const csv = (body?.csv ?? "").trim();
  if (!csv) {
    return NextResponse.json({ ok: false, error: "Paste or upload a CSV first." }, { status: 400 });
  }

  const rows = parseAccountCsv(csv);
  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No rows found. Include a header row with at least customer_id." },
      { status: 400 }
    );
  }

  const result = await bulkUpsertAccounts(rows);

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "ad_account.bulk_imported",
    entityType: "ad_account",
    entityId: "bulk",
    after: { created: result.created, updated: result.updated, skipped: result.skipped },
  });

  return NextResponse.json({ ok: true, ...result });
}
