import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { leads, rejectedLeads, salesRecords } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import {
  isRejectedLikeStatus,
  shouldAdvance,
  type FunnelStatus,
} from "@/lib/sales/funnel";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  lead_id: z.string().uuid(),
});

/**
 * Manually link an unmatched sales_record to a lead. Mirrors the
 * sales.match worker's side-effects (status advance, rejected_leads row).
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

  const { id: salesId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "lead_id (uuid) required" },
      { status: 400 }
    );
  }
  const { lead_id } = parsed.data;

  const rec = await db.query.salesRecords.findFirst({
    where: eq(salesRecords.id, salesId),
  });
  if (!rec) {
    return NextResponse.json(
      { ok: false, error: "sales_record not found" },
      { status: 404 }
    );
  }
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, lead_id),
  });
  if (!lead) {
    return NextResponse.json(
      { ok: false, error: "lead not found" },
      { status: 404 }
    );
  }
  // Follow dedupe chain to the master.
  const masterId = lead.masterLeadId ?? lead.id;
  const master = lead.masterLeadId
    ? await db.query.leads.findFirst({ where: eq(leads.id, masterId) })
    : lead;
  if (!master) {
    return NextResponse.json(
      { ok: false, error: "master lead missing" },
      { status: 500 }
    );
  }

  await db
    .update(salesRecords)
    .set({ leadId: masterId, matchConfidence: "manual" })
    .where(eq(salesRecords.id, salesId));

  const incoming = rec.salesStatus as FunnelStatus | null;
  let newStatus: FunnelStatus | null = null;
  if (incoming && shouldAdvance(master.leadStatus as FunnelStatus, incoming)) {
    newStatus = incoming;
    await db
      .update(leads)
      .set({ leadStatus: incoming })
      .where(eq(leads.id, master.id));
  }

  let rejectedRowId: string | null = null;
  if (incoming && isRejectedLikeStatus(incoming)) {
    const [row] = await db
      .insert(rejectedLeads)
      .values({
        leadId: master.id,
        rejectedByAgentId: null,
        rejectionReason: "other",
        recycleEligible: true,
        resaleEligible: false,
        nextAction: "recycle_later",
        snapshotBrandId: master.brandId,
        snapshotLoanType: master.loanType,
        snapshotLocationRegion: master.locationRegion,
        snapshotCampaignId: master.campaignId,
        snapshotSourcePlatform: master.sourcePlatform,
        notes: rec.rejectionReason ?? "manual-linked rejected sale",
      })
      .returning({ id: rejectedLeads.id });
    rejectedRowId = row.id;
  }

  await writeAudit({
    actorUserId: actorId,
    eventType: "sales.matched_manually",
    entityType: "sales_record",
    entityId: rec.id,
    after: {
      lead_id: master.id,
      new_lead_status: newStatus,
      rejected_row_id: rejectedRowId,
    },
  });

  return NextResponse.json({
    ok: true,
    lead_id: master.id,
    new_lead_status: newStatus,
    rejected_row_id: rejectedRowId,
  });
}
