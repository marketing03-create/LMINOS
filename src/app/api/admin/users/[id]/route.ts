import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

const ROLES = [
  "hq_admin",
  "marketing_manager",
  "team_lead",
  "sales_agent",
  "viewer",
] as const;
type Role = (typeof ROLES)[number];

/** Update a user's role / team / active flag. Admin auth. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });
  const actorId = auth.userId;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    role?: string;
    teamId?: string | null;
    isActive?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const set: { role?: Role; teamId?: string | null; isActive?: boolean } = {};
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as Role)) {
      return NextResponse.json({ ok: false, error: "invalid role" }, { status: 400 });
    }
    set.role = body.role as Role;
  }
  if (body.teamId !== undefined) {
    set.teamId = body.teamId === "" || body.teamId === null ? null : body.teamId;
  }
  if (body.isActive !== undefined) set.isActive = !!body.isActive;

  if (Object.keys(set).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set(set)
    .where(eq(users.id, id))
    .returning({ id: users.id });
  if (!updated) {
    return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
  }

  await writeAudit({
    actorUserId: actorId,
    eventType: "user.updated",
    entityType: "user",
    entityId: id,
    after: set,
  });

  return NextResponse.json({ ok: true });
}
