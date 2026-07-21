import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { leads, rejectedLeads } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";

/**
 * CSV export of resale-eligible leads. Admin-only.
 *
 * Returns a CSV with the original lead's phone/name/email + snapshot
 * attribution + rejection metadata. Suitable for selling out-of-coverage
 * leads to other companies (per plan). Role-gated — this exports raw customer
 * PII, so only admins may pull it (never a viewer/agent/streamer).
 */
export async function GET(_request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const rows = await db
    .select({
      r: rejectedLeads,
      lFullName: leads.fullName,
      lPhone: leads.normalizedPhone,
      lEmail: leads.normalizedEmail,
    })
    .from(rejectedLeads)
    .leftJoin(leads, eq(leads.id, rejectedLeads.leadId))
    .where(eq(rejectedLeads.resaleEligible, true))
    .orderBy(desc(rejectedLeads.rejectedAt))
    .limit(10_000);

  const header = [
    "rejected_id",
    "rejected_at",
    "rejection_reason",
    "loan_type",
    "region",
    "source_platform",
    "full_name",
    "phone",
    "email",
    "notes",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.r.id,
        row.r.rejectedAt.toISOString(),
        row.r.rejectionReason,
        row.r.snapshotLoanType ?? "",
        row.r.snapshotLocationRegion ?? "",
        row.r.snapshotSourcePlatform ?? "",
        csv(row.lFullName),
        csv(row.lPhone),
        csv(row.lEmail),
        csv(row.r.notes),
      ].join(",")
    );
  }

  const body = lines.join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lmiros-resale-${
        new Date().toISOString().slice(0, 10)
      }.csv"`,
    },
  });
}

function csv(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
