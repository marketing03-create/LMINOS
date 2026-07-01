import { escapeMd } from "./send";

export type NewLeadMsg = {
  fullName: string | null;
  phone: string | null;
  loanType: string;
  brandSlug: string;
  source: string;
  campaignName: string | null;
  region: string;
  appBaseUrl: string;
  leadId: string;
};

export function newLeadMessage(m: NewLeadMsg): string {
  const lines = [
    `🆕 *New lead* \\(${escapeMd(m.loanType)}\\)`,
    `*Name:* ${escapeMd(m.fullName ?? "—")}`,
    m.phone ? `*Phone:* \`${escapeMd(m.phone)}\`` : null,
    `*Brand:* ${escapeMd(m.brandSlug)} · *Source:* ${escapeMd(m.source)}`,
    m.campaignName ? `*Campaign:* ${escapeMd(m.campaignName)}` : null,
    `*Region:* ${escapeMd(m.region)}`,
    `[Open in LMIROS](${m.appBaseUrl}/leads/${m.leadId})`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function vipLeadMessage(m: NewLeadMsg): string {
  return `⭐️ *VIP lead*\n${newLeadMessage(m)}`;
}

export function slaBreachMessage(m: NewLeadMsg & { agentName: string | null }): string {
  return [
    `⚠️ *SLA breach* — 5 min and no first contact`,
    `*Agent:* ${escapeMd(m.agentName ?? "—")}`,
    `*Lead:* ${escapeMd(m.fullName ?? "—")} · \`${escapeMd(m.phone ?? "")}\``,
    `*Loan:* ${escapeMd(m.loanType)}`,
    `[Open in LMIROS](${m.appBaseUrl}/leads/${m.leadId})`,
  ].join("\n");
}

export function routingFailureMessage(input: {
  leadId: string;
  reason: string;
  appBaseUrl: string;
}): string {
  return [
    `🚨 *Routing failure*`,
    `*Reason:* ${escapeMd(input.reason)}`,
    `[Open in LMIROS](${input.appBaseUrl}/leads/${input.leadId})`,
  ].join("\n");
}

export function recycleAddedMessage(m: NewLeadMsg & { reason: string | null }): string {
  return [
    `♻️ *Lead added to recycle pool*`,
    `*Lead:* ${escapeMd(m.fullName ?? "—")} · \`${escapeMd(m.phone ?? "")}\``,
    `*Loan:* ${escapeMd(m.loanType)} · *Region:* ${escapeMd(m.region)}`,
    m.reason ? `*Reason:* ${escapeMd(m.reason)}` : null,
    `[Open in LMIROS](${m.appBaseUrl}/leads/${m.leadId})`,
  ].filter(Boolean).join("\n");
}
