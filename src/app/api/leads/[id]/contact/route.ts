import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { leads } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Agent marks a lead as first-contacted. Stops the SLA clock. Idempotent —
 * re-calls are no-ops once first_contacted_at is set.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let actorId: string | null = null;
  if (process.env.LMIROS_DEV_BYPASS_AUTH !== "true") {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new NextResponse("unauthorized", { status: 401 });
    actorId = user.id;
  }

  const { id } = await params;
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
  if (lead.firstContactedAt) {
    return NextResponse.json({
      ok: true,
      already_contacted_at: lead.firstContactedAt,
    });
  }

  const now = new Date();
  await db
    .update(leads)
    .set({
      firstContactedAt: now,
      leadStatus: lead.leadStatus === "new" ? "contacted" : lead.leadStatus,
    })
    .where(eq(leads.id, lead.id));

  await writeAudit({
    actorUserId: actorId,
    eventType: "lead.contacted",
    entityType: "lead",
    entityId: lead.id,
    after: { first_contacted_at: now.toISOString() },
  });

  return NextResponse.json({ ok: true, first_contacted_at: now.toISOString() });
}
