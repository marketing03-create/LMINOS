import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { removedUsers, users } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

const ROLES = [
  "hq_admin",
  "marketing_manager",
  "team_lead",
  "sales_agent",
  "viewer",
  "live_streamer",
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
    isActive?: boolean;
    fullName?: string | null;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const set: {
    role?: Role;
    isActive?: boolean;
    fullName?: string | null;
  } = {};
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as Role)) {
      return NextResponse.json({ ok: false, error: "invalid role" }, { status: 400 });
    }
    set.role = body.role as Role;
  }
  if (body.isActive !== undefined) set.isActive = !!body.isActive;
  if (body.fullName !== undefined) {
    const trimmed = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (trimmed.length > 120) {
      return NextResponse.json({ ok: false, error: "name too long" }, { status: 400 });
    }
    set.fullName = trimmed === "" ? null : trimmed;
  }

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

/**
 * Remove a user from LMIROS. Admin auth. Deletes the app user row; every
 * reference to it is FK `set null`/`cascade`, so this never fails on a foreign
 * key — but a removed agent's past sales/leads become unassigned (the records
 * themselves are kept). You can't remove your own account (avoids locking
 * yourself out). Note: this deletes the LMIROS row, not the Google login — a
 * real person could sign in again as a fresh no-access account.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;

  if (auth.userId && auth.userId === id) {
    return NextResponse.json(
      { ok: false, error: "You can't remove your own account." },
      { status: 400 }
    );
  }

  const [deleted] = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning({ id: users.id, email: users.email });
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
  }

  // Tombstone the email so auto-provisioners (mainly the every-10-min Zoho agent
  // sync) don't resurrect this user on the next run. Without this, a removed
  // agent whose name is still in the Zoho sheet comes straight back.
  await db
    .insert(removedUsers)
    .values({ email: deleted.email.toLowerCase(), removedByUserId: auth.userId ?? null })
    .onConflictDoNothing();

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "user.deleted",
    entityType: "user",
    entityId: id,
    before: { email: deleted.email },
  });

  return NextResponse.json({ ok: true });
}
