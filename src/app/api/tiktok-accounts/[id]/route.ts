import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/** Edit a tracked TikTok handle (name / active / notes). Admin auth. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    displayName?: string;
    isActive?: boolean;
    notes?: string | null;
    leadKeywords?: string | string[] | null;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const set: Record<string, unknown> = {};
  if (typeof body.displayName === "string" && body.displayName.trim())
    set.displayName = body.displayName.trim();
  if (typeof body.isActive === "boolean") set.isActive = body.isActive;
  if ("notes" in body) set.notes = (body.notes ?? "").toString().trim() || null;
  if ("leadKeywords" in body) {
    // Accept a comma-separated string or an array → normalized lowercase list.
    const raw = Array.isArray(body.leadKeywords)
      ? body.leadKeywords
      : (body.leadKeywords ?? "").toString().split(",");
    const kws = [...new Set(raw.map((k) => k.trim().toLowerCase()).filter(Boolean))];
    set.leadKeywords = kws.length ? kws : null;
  }
  if (Object.keys(set).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });
  }
  set.updatedAt = new Date();

  const [row] = await db
    .update(tiktokAccounts)
    .set(set)
    .where(eq(tiktokAccounts.id, id))
    .returning({ id: tiktokAccounts.id });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "tiktok_account.updated",
    entityType: "tiktok_account",
    entityId: id,
    after: set,
  });
  return NextResponse.json({ ok: true });
}

/** Stop tracking a handle (cascades its live sessions). Admin auth. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const [row] = await db
    .delete(tiktokAccounts)
    .where(eq(tiktokAccounts.id, id))
    .returning({ id: tiktokAccounts.id, handle: tiktokAccounts.handle });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "tiktok_account.deleted",
    entityType: "tiktok_account",
    entityId: id,
    after: { handle: row.handle },
  });
  return NextResponse.json({ ok: true });
}
