import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { cronAuthorized } from "@/lib/auth/cron";
import { db } from "@/db/client";
import { leads } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { enqueueLeadNotify } from "@/lib/queue/queues";

const SLA_MINUTES = Number(process.env.SLA_MINUTES ?? "5");
const MAX_BATCH = 500;

/**
 * Runs every minute via Vercel Cron (see vercel.ts).
 *
 * Finds leads where:
 *   - assigned_at < now - SLA_MINUTES
 *   - first_contacted_at IS NULL
 *   - sla_breached_at IS NULL
 *   - lead_status is still 'new' (not 'duplicate_merged' / 'rejected')
 *
 * Marks them breached and enqueues an sla_breach notification.
 */
export async function GET(request: NextRequest) {
  // Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.
  if (!cronAuthorized(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const cutoff = new Date(Date.now() - SLA_MINUTES * 60 * 1000);
  const now = new Date();

  // Find candidates first so we can return a per-lead summary in the response.
  const candidates = await db
    .select({
      id: leads.id,
      assignedAgentId: leads.assignedAgentId,
      assignedAt: leads.assignedAt,
    })
    .from(leads)
    .where(
      and(
        lt(leads.assignedAt, cutoff),
        isNull(leads.firstContactedAt),
        isNull(leads.slaBreachedAt),
        eq(leads.leadStatus, "new"),
        sql`${leads.assignedAgentId} IS NOT NULL`
      )
    )
    .limit(MAX_BATCH);

  let breached = 0;
  for (const c of candidates) {
    await db
      .update(leads)
      .set({ slaBreachedAt: now })
      .where(eq(leads.id, c.id));
    await writeAudit({
      eventType: "lead.sla_breached",
      entityType: "lead",
      entityId: c.id,
      after: {
        assigned_at: c.assignedAt,
        breached_at: now.toISOString(),
        sla_minutes: SLA_MINUTES,
      },
    });
    try {
      await enqueueLeadNotify({ leadId: c.id, notificationType: "sla_breach" });
      breached++;
    } catch (err) {
      console.error(`[sla-scan] enqueue failed for ${c.id}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    breached,
    cutoff: cutoff.toISOString(),
    sla_minutes: SLA_MINUTES,
  });
}
