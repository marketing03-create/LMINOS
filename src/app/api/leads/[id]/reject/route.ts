import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { leads, rejectedLeads } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { enqueueLeadNotify } from "@/lib/queue/queues";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const REASONS = [
  "out_of_coverage",
  "not_eligible",
  "wrong_loan_type",
  "docs_incomplete",
  "unreachable",
  "duplicate_reusable",
  "low_quality",
  "other",
] as const;

const bodySchema = z.object({
  reason: z.enum(REASONS),
  notes: z.string().max(2000).optional(),
});

/**
 * Agent rejects a lead. Inserts rejected_leads row with snapshot fields
 * (so future filters by campaign/source/region still work even if the
 * underlying lead changes), flips lead.lead_status, releases the agent,
 * and enqueues a recycle-added notification to the team lead.
 *
 * Default flags: out_of_coverage + low_quality → resale-eligible only.
 * Everything else → recycle-eligible.
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
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "reason is required", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });

  if (lead.leadStatus === "rejected" || lead.leadStatus === "duplicate_merged") {
    return NextResponse.json(
      { ok: false, error: `lead already ${lead.leadStatus}` },
      { status: 409 }
    );
  }

  const reason = parsed.data.reason;
  const recycleEligible = !(reason === "out_of_coverage" || reason === "low_quality");
  const resaleEligible = reason === "out_of_coverage" || reason === "low_quality";

  const [row] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(rejectedLeads)
      .values({
        leadId: lead.id,
        rejectedByAgentId: actorId ?? lead.assignedAgentId ?? null,
        rejectionReason: reason,
        recycleEligible,
        resaleEligible,
        nextAction: recycleEligible ? "recycle_later" : "sell_external",
        snapshotBrandId: lead.brandId,
        snapshotLoanType: lead.loanType,
        snapshotLocationRegion: lead.locationRegion,
        snapshotCampaignId: lead.campaignId,
        snapshotSourcePlatform: lead.sourcePlatform,
        notes: parsed.data.notes ?? null,
      })
      .returning({ id: rejectedLeads.id });

    await tx
      .update(leads)
      .set({ leadStatus: "rejected", assignedAgentId: null })
      .where(eq(leads.id, lead.id));

    return inserted;
  });

  await writeAudit({
    actorUserId: actorId,
    eventType: "lead.rejected",
    entityType: "lead",
    entityId: lead.id,
    before: { lead_status: lead.leadStatus, assigned_agent_id: lead.assignedAgentId },
    after: {
      reason,
      rejected_row_id: row.id,
      recycle_eligible: recycleEligible,
      resale_eligible: resaleEligible,
      notes: parsed.data.notes,
    },
  });

  try {
    await enqueueLeadNotify({ leadId: lead.id, notificationType: "recycle_added" });
  } catch (err) {
    console.error("[reject] enqueue notify failed:", err);
  }

  return NextResponse.json({
    ok: true,
    rejected_row_id: row.id,
    recycle_eligible: recycleEligible,
    resale_eligible: resaleEligible,
  });
}
