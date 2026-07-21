import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { searchTermAnalyses } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/**
 * Approve one term analysis. Admin auth. Marks it APPROVED + records the
 * reviewer. Does NOT write to Google — applying the negative is a separate,
 * dark-gated step (see [id]/apply).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const [row] = await db
    .update(searchTermAnalyses)
    .set({
      reviewStatus: "APPROVED",
      reviewedByUserId: auth.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(searchTermAnalyses.id, id))
    .returning({ id: searchTermAnalyses.id });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "search_term.approved",
    entityType: "search_term_analysis",
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}
