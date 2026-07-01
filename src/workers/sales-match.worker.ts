import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leads, rejectedLeads, salesRecords } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { getRedis } from "@/lib/queue/connection";
import { QUEUE_NAMES, type SalesMatchJob } from "@/lib/queue/queues";
import { findLeadForSales } from "@/lib/sales/match";
import { isRejectedLikeStatus, shouldAdvance, type FunnelStatus } from "@/lib/sales/funnel";

function mapRejectionReason(raw: string | null): "out_of_coverage" | "not_eligible" | "wrong_loan_type" | "docs_incomplete" | "unreachable" | "duplicate_reusable" | "low_quality" | "other" {
  if (!raw) return "other";
  const k = raw.toLowerCase();
  if (k.includes("coverage") || k.includes("far") || k.includes("location")) return "out_of_coverage";
  if (k.includes("eligible")) return "not_eligible";
  if (k.includes("wrong") || k.includes("loan type")) return "wrong_loan_type";
  if (k.includes("doc")) return "docs_incomplete";
  if (k.includes("unreachable") || k.includes("contact")) return "unreachable";
  if (k.includes("duplicate")) return "duplicate_reusable";
  if (k.includes("quality") || k.includes("low")) return "low_quality";
  return "other";
}

export function startSalesMatchWorker() {
  const worker = new Worker<SalesMatchJob>(
    QUEUE_NAMES.SALES_MATCH,
    async (job) => {
      const { salesRecordId } = job.data;

      const rec = await db.query.salesRecords.findFirst({
        where: eq(salesRecords.id, salesRecordId),
      });
      if (!rec) {
        console.warn(`[sales.match] record ${salesRecordId} not found`);
        return { skipped: true };
      }
      if (rec.leadId) {
        return { skipped: "already_matched" };
      }

      const match = await findLeadForSales({
        normalizedPhone: rec.normalizedPhone,
        normalizedEmail: rec.normalizedEmail,
      });

      if (match.kind === "unmatched") {
        // Keep match_confidence='unmatched'; surfaces in /sales/unmatched.
        return { result: "unmatched" };
      }

      if (match.kind === "fuzzy_multiple") {
        const note = `multiple lead candidates: ${match.candidateLeadIds.join(", ")}`;
        await db
          .update(salesRecords)
          .set({ matchConfidence: "fuzzy", remarks: appendNote(rec.remarks, note) })
          .where(eq(salesRecords.id, rec.id));
        return { result: "fuzzy_flagged", candidates: match.candidateLeadIds };
      }

      // Exact match — link the record, advance the lead, audit.
      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, match.leadId),
      });
      if (!lead) {
        console.warn(`[sales.match] matched lead ${match.leadId} disappeared`);
        return { skipped: "lead_missing" };
      }

      await db
        .update(salesRecords)
        .set({
          leadId: match.leadId,
          matchConfidence: match.kind,
        })
        .where(eq(salesRecords.id, rec.id));

      // Forward-only lead status advance from sales_status.
      const incoming = rec.salesStatus as FunnelStatus | null;
      let newStatus: FunnelStatus | null = null;
      if (incoming && shouldAdvance(lead.leadStatus as FunnelStatus, incoming)) {
        newStatus = incoming;
        await db
          .update(leads)
          .set({ leadStatus: incoming })
          .where(eq(leads.id, lead.id));
      }

      // Auto-create rejected_leads row if the sales record is rejected-like.
      let rejectedRowId: string | null = null;
      if (incoming && isRejectedLikeStatus(incoming)) {
        const [row] = await db
          .insert(rejectedLeads)
          .values({
            leadId: lead.id,
            rejectedByAgentId: null,
            rejectionReason: mapRejectionReason(rec.rejectionReason),
            recycleEligible: true,
            resaleEligible: false,
            nextAction: "recycle_later",
            snapshotBrandId: lead.brandId,
            snapshotLoanType: lead.loanType,
            snapshotLocationRegion: lead.locationRegion,
            snapshotCampaignId: lead.campaignId,
            snapshotSourcePlatform: lead.sourcePlatform,
            notes: rec.rejectionReason ?? null,
          })
          .returning({ id: rejectedLeads.id });
        rejectedRowId = row.id;

        // Release agent assignment so they don't keep nagging the lead.
        await db
          .update(leads)
          .set({ assignedAgentId: null })
          .where(eq(leads.id, lead.id));
      }

      await writeAudit({
        eventType: "sales.matched",
        entityType: "sales_record",
        entityId: rec.id,
        before: { lead_status: lead.leadStatus },
        after: {
          lead_id: lead.id,
          confidence: match.kind,
          new_lead_status: newStatus,
          rejected_row_id: rejectedRowId,
        },
      });

      return {
        result: "matched",
        leadId: lead.id,
        confidence: match.kind,
        advancedTo: newStatus,
        rejectedRowId,
      };
    },
    { connection: getRedis(), concurrency: 4 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[sales.match] job ${job?.id} failed:`, err.message);
  });

  return worker;
}

function appendNote(existing: string | null, add: string): string {
  return [existing, `[auto] ${add}`].filter(Boolean).join("\n");
}
