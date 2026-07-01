import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teams } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/** Rename / toggle a team. Admin auth. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });
  const actorId = auth.userId;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    isActive?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const set: { name?: string; isActive?: boolean } = {};
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ ok: false, error: "name cannot be empty" }, { status: 400 });
    set.name = n;
  }
  if (body.isActive !== undefined) set.isActive = !!body.isActive;
  if (Object.keys(set).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(teams)
    .set(set)
    .where(eq(teams.id, id))
    .returning({ id: teams.id });
  if (!updated) {
    return NextResponse.json({ ok: false, error: "team not found" }, { status: 404 });
  }

  await writeAudit({
    actorUserId: actorId,
    eventType: "team.updated",
    entityType: "team",
    entityId: id,
    after: set,
  });

  return NextResponse.json({ ok: true });
}
