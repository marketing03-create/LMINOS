import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adBlueprints } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { buildBlueprint } from "@/lib/google-ads/build-runner";

// A live :mutate batch can take a while.
export const maxDuration = 300;

/**
 * Build the account in Google Ads — the ONLY money-moving route, and even then
 * everything is created PAUSED so it can't spend. Requires the blueprint to be
 * APPROVED and freshly VALIDATED (a dry-run since the last edit), plus a typed
 * "BUILD" confirmation. If live writes are off (Basic access pending) this is
 * forced to a dry-run and returns the apply-by-hand notice.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if ((body?.confirm ?? "").trim().toUpperCase() !== "BUILD") {
    return NextResponse.json(
      { ok: false, error: 'Type BUILD to confirm.' },
      { status: 400 }
    );
  }

  const existing = await db.query.adBlueprints.findFirst({
    where: eq(adBlueprints.id, id),
    columns: { id: true, status: true, validatedAt: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  if (existing.status !== "approved") {
    return NextResponse.json(
      { ok: false, error: "Approve the blueprint before building." },
      { status: 409 }
    );
  }
  if (!existing.validatedAt) {
    return NextResponse.json(
      { ok: false, error: "Run Validate (dry-run) first — and re-validate after any edit." },
      { status: 409 }
    );
  }

  try {
    const outcome = await buildBlueprint(id);
    await writeAudit({
      actorUserId: auth.userId,
      eventType: "ads_blueprint.built",
      entityType: "ad_blueprint",
      entityId: id,
      after: { applied: outcome.applied, ok: outcome.ok, error: outcome.error ?? null },
    });
    return NextResponse.json(outcome, { status: outcome.ok ? 200 : 422 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
