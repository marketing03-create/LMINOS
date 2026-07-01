import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { teams } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/** Create a team. Admin auth. */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });
  const actorId = auth.userId;

  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = (body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: "Team name is required." }, { status: 400 });
  }

  const [row] = await db.insert(teams).values({ name }).returning({ id: teams.id });

  await writeAudit({
    actorUserId: actorId,
    eventType: "team.created",
    entityType: "team",
    entityId: row.id,
    after: { name },
  });

  return NextResponse.json({ ok: true, id: row.id });
}
