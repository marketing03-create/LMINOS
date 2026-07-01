import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adProposals } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/** Reject a proposal. Admin auth. Marks it rejected + records the reviewer. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const [row] = await db
    .update(adProposals)
    .set({
      status: "rejected",
      reviewedByUserId: auth.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(adProposals.id, id))
    .returning({ id: adProposals.id });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "ads_proposal.rejected",
    entityType: "ad_proposal",
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}
