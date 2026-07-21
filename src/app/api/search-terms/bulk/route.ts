import { NextResponse, type NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { searchTermAnalyses } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/**
 * Bulk-review term analyses: approve or reject many at once. Admin auth.
 * Applying to Google is never bulk here — that stays one-at-a-time behind the
 * dark gate.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    ids?: string[];
    action?: "approve" | "reject";
  } | null;
  const ids = (body?.ids ?? []).filter((x) => typeof x === "string");
  if (ids.length === 0 || (body?.action !== "approve" && body?.action !== "reject")) {
    return NextResponse.json(
      { ok: false, error: "ids[] and action (approve|reject) required" },
      { status: 400 }
    );
  }

  const updated = await db
    .update(searchTermAnalyses)
    .set({
      reviewStatus: body.action === "approve" ? "APPROVED" : "REJECTED",
      reviewedByUserId: auth.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(inArray(searchTermAnalyses.id, ids))
    .returning({ id: searchTermAnalyses.id });

  await writeAudit({
    actorUserId: auth.userId,
    eventType: `search_term.bulk_${body.action}`,
    entityType: "search_term_analysis",
    entityId: ids[0],
    after: { count: updated.length, ids },
  });

  return NextResponse.json({ ok: true, count: updated.length });
}
