import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { websites } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/** Update a website (name / status / whatsapp / notes / active). Admin auth. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    status?: string;
    whatsappNumber?: string | null;
    notes?: string | null;
    isActive?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const set: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) set.name = body.name.trim();
  if (body.status === "active" || body.status === "paused") set.status = body.status;
  if ("whatsappNumber" in body)
    set.whatsappNumber = (body.whatsappNumber ?? "").toString().trim() || null;
  if ("notes" in body) set.notes = (body.notes ?? "").toString().trim() || null;
  if (typeof body.isActive === "boolean") set.isActive = body.isActive;

  if (Object.keys(set).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });
  }
  set.updatedAt = new Date();

  const [row] = await db
    .update(websites)
    .set(set)
    .where(eq(websites.id, id))
    .returning({ id: websites.id });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404 });
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "website.updated",
    entityType: "website",
    entityId: id,
    after: set,
  });

  return NextResponse.json({ ok: true });
}

/**
 * Delete a website. Its agent-pool links cascade; ad accounts keep their data
 * but lose the websiteId link (set null); leads (matched by slug) are unaffected.
 * Admin auth.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const [row] = await db
    .delete(websites)
    .where(eq(websites.id, id))
    .returning({ id: websites.id, slug: websites.slug });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404 });
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "website.deleted",
    entityType: "website",
    entityId: id,
    after: { slug: row.slug },
  });

  return NextResponse.json({ ok: true });
}
