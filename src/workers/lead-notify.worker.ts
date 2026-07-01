import { Worker } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  brands,
  campaigns,
  leads,
  notifications,
  teams,
  users,
} from "@/db/schema";
import { getRedis } from "@/lib/queue/connection";
import { QUEUE_NAMES, type LeadNotifyJob } from "@/lib/queue/queues";
import {
  newLeadMessage,
  recycleAddedMessage,
  routingFailureMessage,
  slaBreachMessage,
  vipLeadMessage,
} from "@/lib/telegram/format";
import { sendMarkdown } from "@/lib/telegram/send";

const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function recordNotification(input: {
  userId: string | null;
  type: LeadNotifyJob["notificationType"];
  leadId: string;
  channel: "telegram";
  status: string;
  payload?: unknown;
}) {
  await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    leadId: input.leadId,
    channel: input.channel,
    deliveryStatus: input.status,
    sentAt: input.status === "sent" ? new Date() : null,
    payload: (input.payload as object) ?? null,
  });
}

export function startLeadNotifyWorker() {
  const worker = new Worker<LeadNotifyJob>(
    QUEUE_NAMES.LEAD_NOTIFY,
    async (job) => {
      const { leadId, notificationType } = job.data;

      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, leadId),
      });
      if (!lead) {
        console.warn(`[lead.notify] lead ${leadId} not found`);
        return { skipped: true };
      }

      const brand = await db.query.brands.findFirst({
        where: eq(brands.id, lead.brandId),
      });
      const campaign = lead.campaignId
        ? await db.query.campaigns.findFirst({
            where: eq(campaigns.id, lead.campaignId),
          })
        : null;

      const team = lead.assignedTeamId
        ? await db.query.teams.findFirst({
            where: eq(teams.id, lead.assignedTeamId),
          })
        : null;

      const agent = lead.assignedAgentId
        ? await db.query.users.findFirst({
            where: eq(users.id, lead.assignedAgentId),
          })
        : null;

      const baseMsg = {
        fullName: lead.fullName,
        phone: lead.normalizedPhone,
        loanType: lead.loanType,
        brandSlug: brand?.slug ?? "?",
        source: lead.sourcePlatform,
        campaignName: campaign?.name ?? null,
        region: lead.locationRegion,
        appBaseUrl: APP_BASE_URL,
        leadId: lead.id,
      };

      const text =
        notificationType === "vip_lead"
          ? vipLeadMessage(baseMsg)
          : notificationType === "sla_breach"
            ? slaBreachMessage({ ...baseMsg, agentName: agent?.fullName ?? agent?.email ?? null })
            : notificationType === "routing_failure"
              ? routingFailureMessage({
                  leadId: lead.id,
                  appBaseUrl: APP_BASE_URL,
                  reason: "no_rule_matched_or_no_agents",
                })
              : notificationType === "recycle_added"
                ? recycleAddedMessage({ ...baseMsg, reason: null })
                : newLeadMessage(baseMsg);

      // Channel selection by notification type:
      //   new_lead     → DM agent + post to team group
      //   vip_lead     → DM agent + DM hq_admins + team group
      //   sla_breach   → DM team_leads on this team + team group
      //   routing_failure → DM hq_admins
      const recipients = await resolveRecipients(notificationType, {
        agentChatId: agent?.telegramChatId,
        teamId: team?.id,
        teamGroupId: team?.telegramGroupId,
      });

      let sent = 0;
      for (const r of recipients) {
        const res = await sendMarkdown(r.chatId, text);
        if (res.ok) sent++;
        await recordNotification({
          userId: r.userId,
          type: notificationType,
          leadId,
          channel: "telegram",
          status: res.ok ? "sent" : `failed:${res.reason}`,
          payload: { chatId: r.chatId, text },
        });
      }

      console.log(
        `[lead.notify] ${notificationType} for ${leadId}: ${sent}/${recipients.length} delivered`
      );
      return { sent, attempted: recipients.length };
    },
    { connection: getRedis(), concurrency: 4 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[lead.notify] job ${job?.id} failed:`, err.message);
  });

  return worker;
}

type Recipient = { chatId: string; userId: string | null };

async function resolveRecipients(
  notificationType: LeadNotifyJob["notificationType"],
  ctx: {
    agentChatId: string | null | undefined;
    teamId: string | undefined;
    teamGroupId: string | null | undefined;
  }
): Promise<Recipient[]> {
  const out: Recipient[] = [];

  // Agent DM
  if (
    (notificationType === "new_lead" || notificationType === "vip_lead") &&
    ctx.agentChatId
  ) {
    out.push({ chatId: ctx.agentChatId, userId: null });
  }

  // Team lead DMs (team_lead role on the same team)
  if (
    (notificationType === "sla_breach" ||
      notificationType === "vip_lead" ||
      notificationType === "recycle_added") &&
    ctx.teamId
  ) {
    const leads_ = await db
      .select({ id: users.id, chatId: users.telegramChatId })
      .from(users)
      .where(
        and(
          eq(users.teamId, ctx.teamId),
          eq(users.role, "team_lead"),
          eq(users.isActive, true)
        )
      );
    for (const u of leads_) {
      if (u.chatId) out.push({ chatId: u.chatId, userId: u.id });
    }
  }

  // HQ admin DMs
  if (
    notificationType === "vip_lead" ||
    notificationType === "routing_failure"
  ) {
    const admins = await db
      .select({ id: users.id, chatId: users.telegramChatId })
      .from(users)
      .where(
        and(
          inArray(users.role, ["hq_admin"]),
          eq(users.isActive, true)
        )
      );
    for (const a of admins) {
      if (a.chatId) out.push({ chatId: a.chatId, userId: a.id });
    }
  }

  // Team group post
  if (
    (notificationType === "new_lead" ||
      notificationType === "vip_lead" ||
      notificationType === "sla_breach") &&
    ctx.teamGroupId
  ) {
    out.push({ chatId: ctx.teamGroupId, userId: null });
  }

  return out;
}
