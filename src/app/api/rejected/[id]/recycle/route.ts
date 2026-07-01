import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { leads, rejectedLeads } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { enqueueLeadRoute } from "@/lib/queue/queues";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  override_loan_type: z
    .enum(["personal", "bank", "angkasa", "car", "sme"])
    .optional(),
});

/**
 * Recycle a rejected lead: create a NEW lead row from the original lead's
 * data (preserving the original lead unchanged), mark the rejected row as
 * recycled, and enqueue routing for the new lead.
 *
 * Optional `override_loan_type` reallocates the lead to a different vertical
 * (e.g. SME-rejected → Personal).
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
      { ok: false, error: "invalid body" },
      { status: 400 }
    );
  }
  const overrideLoan = parsed.data.override_loan_type;

  const rej = await db.query.rejectedLeads.findFirst({
    where: eq(rejectedLeads.id, id),
  });
  if (!rej) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  if (!rej.recycleEligible) {
    return NextResponse.json(
      { ok: false, error: "not recycle-eligible" },
      { status: 409 }
    );
  }
  if (rej.recycledAt) {
    return NextResponse.json(
      { ok: false, error: "already recycled" },
      { status: 409 }
    );
  }

  const original = await db.query.leads.findFirst({
    where: eq(leads.id, rej.leadId),
  });
  if (!original) {
    return NextResponse.json(
      { ok: false, error: "original lead missing" },
      { status: 500 }
    );
  }

  const now = new Date();
  const [newLead] = await db.transaction(async (tx) => {
    // Insert a brand-new lead, status='new', no agent.
    const inserted = await tx
      .insert(leads)
      .values({
        brandId: original.brandId,
        loanType: overrideLoan ?? (original.loanType as never),
        fullName: original.fullName,
        phoneNumberRaw: original.phoneNumberRaw,
        normalizedPhone: original.normalizedPhone,
        emailRaw: original.emailRaw,
        normalizedEmail: original.normalizedEmail,
        sourcePlatform: original.sourcePlatform,
        sourceChannel: original.sourceChannel,
        landingPageUrl: original.landingPageUrl,
        keyword: original.keyword,
        adAccountId: original.adAccountId,
        campaignId: original.campaignId,
        adSetId: original.adSetId,
        adId: original.adId,
        leadStatus: "new",
        priorityLevel: original.priorityLevel,
        locationRegion: original.locationRegion,
        submittedAt: now,
        rawPayload: { recycled_from: original.id, original_loan_type: original.loanType },
        notes: `Recycled from lead ${original.id}` +
          (overrideLoan ? ` (reallocated ${original.loanType} → ${overrideLoan})` : ""),
      })
      .returning({ id: leads.id });

    const newLeadId = inserted[0].id;
    await tx
      .update(rejectedLeads)
      .set({
        recycledAt: now,
        recycledToLeadId: newLeadId,
      })
      .where(eq(rejectedLeads.id, rej.id));

    return inserted;
  });

  await writeAudit({
    actorUserId: actorId,
    eventType: "lead.recycled",
    entityType: "rejected_lead",
    entityId: rej.id,
    after: {
      new_lead_id: newLead.id,
      original_lead_id: original.id,
      override_loan_type: overrideLoan ?? null,
    },
  });

  try {
    await enqueueLeadRoute({ leadId: newLead.id });
  } catch (err) {
    console.error("[recycle] enqueue route failed:", err);
  }

  return NextResponse.json({
    ok: true,
    new_lead_id: newLead.id,
    original_lead_id: original.id,
  });
}
