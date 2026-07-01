import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { assignmentsHistory, leads, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { enqueueLeadNotify } from "@/lib/queue/queues";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  agent_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

/**
 * Team lead / admin manually (re)assigns a lead. Writes assignments_history
 * + audit log and enqueues a new_lead notification so the new agent gets
 * a Telegram ping.
 */
export async function POST(
  request: NextRequest,
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
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "agent_id required (uuid)" },
      { status: 400 }
    );
  }

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });

  const newAgent = await db.query.users.findFirst({
    where: eq(users.id, parsed.data.agent_id),
  });
  if (!newAgent) return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 });
  if (!newAgent.isActive) {
    return NextResponse.json({ ok: false, error: "agent inactive" }, { status: 409 });
  }

  const fromAgentId = lead.assignedAgentId;
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({
        assignedAgentId: newAgent.id,
        assignedTeamId: newAgent.teamId,
        assignedAt: now,
        // Reset SLA clock so the new agent gets the full window.
        slaBreachedAt: null,
        firstContactedAt: null,
      })
      .where(eq(leads.id, lead.id));

    await tx.insert(assignmentsHistory).values({
      leadId: lead.id,
      fromAgentId,
      toAgentId: newAgent.id,
      reason: parsed.data.reason ?? "manual",
      assignedBy: actorId,
    });
  });

  await writeAudit({
    actorUserId: actorId,
    eventType: "lead.reassigned",
    entityType: "lead",
    entityId: lead.id,
    before: { assigned_agent_id: fromAgentId },
    after: {
      assigned_agent_id: newAgent.id,
      assigned_team_id: newAgent.teamId,
      reason: parsed.data.reason ?? "manual",
    },
  });

  try {
    await enqueueLeadNotify({ leadId: lead.id, notificationType: "new_lead" });
  } catch (err) {
    console.error("[assign] enqueue notify failed:", err);
  }

  return NextResponse.json({
    ok: true,
    assigned_agent_id: newAgent.id,
    from_agent_id: fromAgentId,
  });
}
