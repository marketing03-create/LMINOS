import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adBlueprints } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { revertBlueprint } from "@/lib/google-ads/build-runner";

export const maxDuration = 300;

/**
 * Tear down a BUILT account: remove every created resource in reverse order.
 * Requires the blueprint to be in `built` state + a typed "REVERT" confirm.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if ((body?.confirm ?? "").trim().toUpperCase() !== "REVERT") {
    return NextResponse.json({ ok: false, error: "Type REVERT to confirm." }, { status: 400 });
  }

  const existing = await db.query.adBlueprints.findFirst({
    where: eq(adBlueprints.id, id),
    columns: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  if (existing.status !== "built") {
    return NextResponse.json(
      { ok: false, error: "Only a built blueprint can be reverted." },
      { status: 409 }
    );
  }

  try {
    const result = await revertBlueprint(id);
    await writeAudit({
      actorUserId: auth.userId,
      eventType: "ads_blueprint.reverted",
      entityType: "ad_blueprint",
      entityId: id,
      after: { removed: result.removed, ok: result.ok, error: result.error ?? null },
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
