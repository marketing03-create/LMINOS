import { Worker } from "bullmq";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assignmentsHistory,
  leads,
  routingRules as routingRulesTable,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { getRedis } from "@/lib/queue/connection";
import {
  QUEUE_NAMES,
  enqueueLeadNotify,
  type LeadRouteJob,
} from "@/lib/queue/queues";
import {
  actionSchema,
  conditionsSchema,
  pickAction,
  type RoutableLead,
  type RoutingRule,
} from "@/lib/routing/engine";
import {
  countAssignedToday,
  fetchTeamAgents,
  pickFromAgents,
  redisCursorStore,
} from "@/lib/routing/round-robin";

async function loadRules(): Promise<RoutingRule[]> {
  const rows = await db
    .select()
    .from(routingRulesTable)
    .where(eq(routingRulesTable.isActive, true))
    .orderBy(asc(routingRulesTable.priority));

  return rows.map((r) => ({
    id: r.id,
    priority: r.priority,
    name: r.name,
    isActive: r.isActive,
    conditions: conditionsSchema.parse(r.conditions),
    action: actionSchema.parse(r.action),
  }));
}

export function startLeadRouteWorker() {
  const worker = new Worker<LeadRouteJob>(
    QUEUE_NAMES.LEAD_ROUTE,
    async (job) => {
      const { leadId } = job.data;

      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, leadId),
      });
      if (!lead) {
        console.warn(`[lead.route] lead ${leadId} not found`);
        return { skipped: true };
      }

      // Skip if already assigned (e.g. dedupe linked it to an existing master
      // who already has an agent).
      if (lead.assignedAgentId) {
        return { skipped: "already_assigned" };
      }

      const routable: RoutableLead = {
        loan_type: lead.loanType,
        brand_id: lead.brandId,
        priority_level: lead.priorityLevel,
        location_region: lead.locationRegion,
        source_platform: lead.sourcePlatform,
      };

      const rules = await loadRules();
      const matched = pickAction(routable, rules);

      if (!matched) {
        console.warn(`[lead.route] no rule matched lead ${leadId}`);
        await writeAudit({
          eventType: "lead.routing_failed",
          entityType: "lead",
          entityId: leadId,
          after: { reason: "no_rule_matched" },
        });
        await enqueueLeadNotify({
          leadId,
          notificationType: "routing_failure",
        });
        return { routed: false, reason: "no_rule_matched" };
      }

      const agents = await fetchTeamAgents(matched.action.team_id);
      const pick = await pickFromAgents(
        matched.action.team_id,
        agents,
        redisCursorStore(),
        countAssignedToday
      );

      if (pick.kind === "no_agents") {
        await writeAudit({
          eventType: "lead.routing_failed",
          entityType: "lead",
          entityId: leadId,
          after: { reason: "team_has_no_agents", team_id: matched.action.team_id },
        });
        await enqueueLeadNotify({ leadId, notificationType: "routing_failure" });
        return { routed: false, reason: "team_has_no_agents" };
      }

      if (pick.kind === "all_at_capacity") {
        // Assign to team only, no agent. Team lead is notified to manually balance.
        await db
          .update(leads)
          .set({
            assignedTeamId: matched.action.team_id,
            assignedAt: new Date(),
          })
          .where(eq(leads.id, leadId));
        await writeAudit({
          eventType: "lead.assigned_team_only",
          entityType: "lead",
          entityId: leadId,
          after: { team_id: matched.action.team_id, reason: "all_at_capacity" },
        });
        await enqueueLeadNotify({ leadId, notificationType: "routing_failure" });
        return { routed: "team_only" };
      }

      // Happy path: pick.kind === "agent"
      const assignedAt = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(leads)
          .set({
            assignedAgentId: pick.agent.id,
            assignedTeamId: matched.action.team_id,
            assignedAt,
          })
          .where(eq(leads.id, leadId));

        await tx.insert(assignmentsHistory).values({
          leadId,
          fromAgentId: null,
          toAgentId: pick.agent.id,
          reason: `auto:${matched.rule.name}`,
          assignedBy: null,
        });
      });

      await writeAudit({
        eventType: "lead.assigned",
        entityType: "lead",
        entityId: leadId,
        after: {
          agent_id: pick.agent.id,
          team_id: matched.action.team_id,
          rule_id: matched.rule.id,
          rule_name: matched.rule.name,
        },
      });

      // Determine notification type: hot/vip get DM + group post,
      // warm/cold just DM. Worker handles the channel routing.
      const notificationType =
        lead.priorityLevel === "vip" ? "vip_lead" : "new_lead";
      await enqueueLeadNotify({ leadId, notificationType });

      console.log(
        `[lead.route] assigned ${leadId} → agent ${pick.agent.id} (rule: ${matched.rule.name})`
      );
      return { routed: true, agentId: pick.agent.id };
    },
    { connection: getRedis(), concurrency: 4 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[lead.route] job ${job?.id} failed:`, err.message);
  });

  return worker;
}
