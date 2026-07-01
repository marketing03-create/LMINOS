import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leadTouchpoints, leads } from "@/db/schema";
import { findDuplicates } from "@/lib/dedupe/matcher";
import { getRedis } from "@/lib/queue/connection";
import {
  QUEUE_NAMES,
  enqueueLeadRoute,
  type LeadDedupeJob,
} from "@/lib/queue/queues";

export function startLeadDedupeWorker() {
  const worker = new Worker<LeadDedupeJob>(
    QUEUE_NAMES.LEAD_DEDUPE,
    async (job) => {
      const { leadId } = job.data;

      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, leadId),
      });
      if (!lead) {
        console.warn(`[lead.dedupe] lead ${leadId} not found`);
        return { skipped: true };
      }

      const match = await findDuplicates(leadId);

      if (match.kind === "none") {
        console.log(`[lead.dedupe] ${leadId}: new master`);
        await enqueueLeadRoute({ leadId });
        return { result: "new_master" };
      }

      if (match.kind === "fuzzy") {
        // Don't auto-merge; flag for manual review by team lead.
        const note = `[auto] possible duplicate of ${match.candidateIds.join(", ")} (fuzzy)`;
        const merged = [lead.notes, note].filter(Boolean).join("\n");
        await db
          .update(leads)
          .set({ notes: merged })
          .where(eq(leads.id, leadId));
        // Still route — agent will review and merge manually if needed.
        await enqueueLeadRoute({ leadId });
        return { result: "fuzzy_flagged", candidateIds: match.candidateIds };
      }

      // L1 or L2 — auto-merge.
      const masterId = match.masterLeadId;
      if (masterId === leadId) {
        // This lead is the new master (oldest in the set). Promote any older
        // children below it. For Phase 1 simplicity, just leave older children
        // pointing at their previous master if any; new lead is master here.
        await enqueueLeadRoute({ leadId });
        return { result: "kept_as_master" };
      }

      // This lead is a child of an existing master.
      await db.transaction(async (tx) => {
        await tx
          .update(leads)
          .set({
            masterLeadId: masterId,
            leadStatus: "duplicate_merged",
            assignedAgentId: null,
            assignedTeamId: null,
          })
          .where(eq(leads.id, leadId));

        await tx.insert(leadTouchpoints).values({
          leadId: masterId,
          brandId: lead.brandId,
          sourcePlatform: lead.sourcePlatform,
          campaignId: lead.campaignId,
          adId: lead.adId,
          submittedAt: lead.submittedAt,
          rawPayload: lead.rawPayload as object,
        });
      });

      console.log(
        `[lead.dedupe] ${leadId} merged into master ${masterId} (${match.kind})`
      );
      return { result: "merged_into_master", masterLeadId: masterId };
    },
    { connection: getRedis(), concurrency: 4 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[lead.dedupe] job ${job?.id} failed:`, err.message);
  });

  return worker;
}
