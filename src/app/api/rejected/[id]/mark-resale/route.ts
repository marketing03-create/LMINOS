import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { rejectedLeads } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const rej = await db.query.rejectedLeads.findFirst({
    where: eq(rejectedLeads.id, id),
  });
  if (!rej) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  await db
    .update(rejectedLeads)
    .set({ resaleEligible: true, nextAction: "sell_external" })
    .where(eq(rejectedLeads.id, id));

  await writeAudit({
    actorUserId: actorId,
    eventType: "lead.marked_resale_eligible",
    entityType: "rejected_lead",
    entityId: id,
    before: {
      resale_eligible: rej.resaleEligible,
      next_action: rej.nextAction,
    },
    after: { resale_eligible: true, next_action: "sell_external" },
  });

  return NextResponse.json({ ok: true });
}
