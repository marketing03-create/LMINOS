import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adBlueprints } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/**
 * Status transitions for a blueprint: submit (draft→pending), approve
 * (pending→approved), reject (→rejected). Approve/reject record the reviewer.
 * No Google write — that's the build route, behind this approval.
 */
const FLOW: Record<
  string,
  { from: string[]; to: "pending" | "approved" | "rejected" }
> = {
  submit: { from: ["draft"], to: "pending" },
  approve: { from: ["pending"], to: "approved" },
  reject: { from: ["draft", "pending", "approved"], to: "rejected" },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action ?? "";
  const flow = FLOW[action];
  if (!flow) {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  const existing = await db.query.adBlueprints.findFirst({
    where: eq(adBlueprints.id, id),
    columns: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  if (!flow.from.includes(existing.status)) {
    return NextResponse.json(
      { ok: false, error: `Can't ${action} a ${existing.status} blueprint.` },
      { status: 409 }
    );
  }

  const reviewed = action === "approve" || action === "reject";
  await db
    .update(adBlueprints)
    .set({
      status: flow.to,
      ...(reviewed
        ? { reviewedByUserId: auth.userId, reviewedAt: new Date() }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(adBlueprints.id, id));

  await writeAudit({
    actorUserId: auth.userId,
    eventType: `ads_blueprint.${action}`,
    entityType: "ad_blueprint",
    entityId: id,
    after: { status: flow.to },
  });

  return NextResponse.json({ ok: true, status: flow.to });
}
