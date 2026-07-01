import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adBlueprints } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { budgetCapMyrPerDay } from "@/lib/ai/ads-planner";
import {
  BLUEPRINT_SCHEMA,
  clampBudgets,
  summarizeBlueprint,
} from "@/lib/ai/ads-planner-core";
import { materializeSteps } from "@/lib/google-ads/build-runner";

/** Save reviewer edits to a draft/pending blueprint, re-materializing steps. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    blueprint?: unknown;
  } | null;

  const parsed = BLUEPRINT_SCHEMA.safeParse(body?.blueprint);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Blueprint failed validation: " + parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const existing = await db.query.adBlueprints.findFirst({
    where: eq(adBlueprints.id, id),
    columns: { id: true, status: true, externalCustomerId: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  if (!["draft", "pending"].includes(existing.status)) {
    return NextResponse.json(
      { ok: false, error: "Only draft or pending blueprints can be edited." },
      { status: 409 }
    );
  }

  const blueprint = clampBudgets(parsed.data, budgetCapMyrPerDay());
  const summary = summarizeBlueprint(blueprint);

  await db
    .update(adBlueprints)
    .set({
      blueprint,
      title: blueprint.accountName,
      dailyBudgetMyr: String(summary.totalDailyBudgetMyr),
      status: "draft", // edits reset to draft → must re-submit + re-validate
      validatedAt: null,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(adBlueprints.id, id));

  const steps = await materializeSteps(id, blueprint, existing.externalCustomerId ?? "");

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "ads_blueprint.edited",
    entityType: "ad_blueprint",
    entityId: id,
    after: { steps, ...summary },
  });

  return NextResponse.json({ ok: true, steps, ...summary });
}

/** Discard a draft/rejected blueprint (cascades its build steps). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const [row] = await db
    .delete(adBlueprints)
    .where(eq(adBlueprints.id, id))
    .returning({ id: adBlueprints.id, status: adBlueprints.status });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  await writeAudit({
    actorUserId: auth.userId,
    eventType: "ads_blueprint.deleted",
    entityType: "ad_blueprint",
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}
