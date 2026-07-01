/**
 * Verifies the forward-only lead_status protection used by the Zoho sync.
 *
 *   npm run test:forward-only
 *
 * Scenario the bot creates: a lead is marked "approved" by a Telegram /sale,
 * but its Zoho row still says "pending". The every-10-min Zoho re-sync must
 * NOT downgrade it. This runs the EXACT onConflict expression the sync uses
 * (FORWARD_ONLY_LEAD_STATUS) against a real lead, then restores it.
 */
import { and, desc, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { leads } from "@/db/schema";
import { FORWARD_ONLY_LEAD_STATUS } from "@/lib/zoho/sync";

function log(...a: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...a);
}

/** Mirror the sync's leads upsert for a single row, using the shared expr. */
async function upsertWithProposedStatus(
  lead: {
    externalRecordId: string;
    brandId: string;
    loanType: typeof leads.loanType._.data;
    sourcePlatform: typeof leads.sourcePlatform._.data;
  },
  proposed: typeof leads.leadStatus._.data
) {
  await db
    .insert(leads)
    .values({
      brandId: lead.brandId,
      loanType: lead.loanType,
      sourcePlatform: lead.sourcePlatform,
      externalRecordId: lead.externalRecordId,
      leadStatus: proposed,
    })
    .onConflictDoUpdate({
      target: leads.externalRecordId,
      set: {
        leadStatus: FORWARD_ONLY_LEAD_STATUS,
        updatedAt: sql`now()`,
      },
    });
}

async function statusOf(id: string) {
  const r = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    columns: { leadStatus: true },
  });
  return r?.leadStatus;
}

async function main() {
  let pass = true;

  const lead = await db.query.leads.findFirst({
    where: and(
      isNotNull(leads.externalRecordId),
      notInArray(leads.leadStatus, ["approved", "closed", "duplicate_merged"])
    ),
    orderBy: [desc(leads.submittedAt)],
    columns: {
      id: true,
      externalRecordId: true,
      brandId: true,
      loanType: true,
      sourcePlatform: true,
      leadStatus: true,
    },
  });
  if (!lead?.externalRecordId) {
    log("✗ no eligible lead with an external_record_id found");
    process.exit(1);
  }
  const original = lead.leadStatus;
  const ref = {
    externalRecordId: lead.externalRecordId,
    brandId: lead.brandId,
    loanType: lead.loanType,
    sourcePlatform: lead.sourcePlatform,
  };
  log(`lead ${lead.id} (record ${lead.externalRecordId}) original status=${original}`);

  try {
    // Case 1: bot set it approved; Zoho still says pending → must stay approved.
    await db.update(leads).set({ leadStatus: "approved" }).where(eq(leads.id, lead.id));
    await upsertWithProposedStatus(ref, "pending");
    const after1 = await statusOf(lead.id);
    const ok1 = after1 === "approved";
    log(`  ${ok1 ? "✓" : "✗"} approved lead + Zoho "pending"  → stayed ${after1}`);
    pass &&= ok1;

    // Case 2: a non-terminal lead CAN still be pushed forward by Zoho.
    await db.update(leads).set({ leadStatus: "contacted" }).where(eq(leads.id, lead.id));
    await upsertWithProposedStatus(ref, "approved");
    const after2 = await statusOf(lead.id);
    const ok2 = after2 === "approved";
    log(`  ${ok2 ? "✓" : "✗"} contacted lead + Zoho "approved" → moved to ${after2}`);
    pass &&= ok2;

    // Case 3: ordinary update path still flows (pending → contacted).
    await db.update(leads).set({ leadStatus: "pending" }).where(eq(leads.id, lead.id));
    await upsertWithProposedStatus(ref, "contacted");
    const after3 = await statusOf(lead.id);
    const ok3 = after3 === "contacted";
    log(`  ${ok3 ? "✓" : "✗"} pending lead + Zoho "contacted" → moved to ${after3}`);
    pass &&= ok3;
  } finally {
    await db.update(leads).set({ leadStatus: original }).where(eq(leads.id, lead.id));
    log(`\ncleanup: reverted lead ${lead.id} → ${original}`);
  }

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
