import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { websiteAgents } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/** Add an agent to a website's pool. Admin auth. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id: websiteId } = await params;
  const body = (await request.json().catch(() => null)) as { userId?: string } | null;
  const userId = (body?.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
  }

  await db
    .insert(websiteAgents)
    .values({ websiteId, userId })
    .onConflictDoNothing();

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "website.agent_added",
    entityType: "website",
    entityId: websiteId,
    after: { userId },
  });

  return NextResponse.json({ ok: true });
}

/** Remove an agent from a website's pool. Admin auth. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id: websiteId } = await params;
  const body = (await request.json().catch(() => null)) as { userId?: string } | null;
  const userId = (body?.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
  }

  await db
    .delete(websiteAgents)
    .where(
      and(eq(websiteAgents.websiteId, websiteId), eq(websiteAgents.userId, userId))
    );

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "website.agent_removed",
    entityType: "website",
    entityId: websiteId,
    after: { userId },
  });

  return NextResponse.json({ ok: true });
}
