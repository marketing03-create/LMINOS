/**
 * Per-agent performance metrics, computed from minimal lead + sales fixtures.
 * Pure functions — DB/aggregation lives in the page server component.
 */

export type LeadFixture = {
  agentId: string;
  status:
    | "new"
    | "contacted"
    | "pending"
    | "approved"
    | "rejected"
    | "closed"
    | "not_suitable"
    | "unreachable";
  assignedAt: Date | null;
  firstContactedAt: Date | null;
  slaBreachedAt: Date | null;
};

export type SaleFixture = {
  agentId: string;
  status: "approved" | "closed" | "rejected" | "not_suitable" | "unreachable" | null;
  revenueValue: number | null; // in MYR
};

export type AgentStats = {
  assigned: number;
  contacted: number;
  pending: number;
  approved: number;
  rejected: number;
  closed: number;
  unreachable: number;
  closeRate: number; // approved+closed / outcomes
  approvalRate: number; // approved+closed / outcomes
  avgResponseMs: number | null; // mean of (first_contacted - assigned) when both set
  slaCompliancePct: number; // % of leads that did NOT breach SLA
  revenueMyr: number;
};

const CLOSED_LIKE = new Set(["approved", "closed"]);
const OUTCOME = new Set([
  "approved",
  "closed",
  "rejected",
  "not_suitable",
  "unreachable",
]);

export function computeAgentStats(
  leads: LeadFixture[],
  sales: SaleFixture[]
): AgentStats {
  const assigned = leads.length;
  const contacted = leads.filter((l) => l.firstContactedAt != null).length;

  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let closed = 0;
  let unreachable = 0;
  let outcomes = 0;
  let slaOk = 0;
  let withSlaScope = 0;
  let respSum = 0;
  let respCount = 0;

  for (const l of leads) {
    if (l.status === "pending") pending++;
    if (l.status === "approved") approved++;
    if (l.status === "rejected" || l.status === "not_suitable") rejected++;
    if (l.status === "closed") closed++;
    if (l.status === "unreachable") unreachable++;
    if (OUTCOME.has(l.status)) outcomes++;

    if (l.assignedAt) {
      withSlaScope++;
      if (l.slaBreachedAt == null) slaOk++;
      if (l.firstContactedAt) {
        respSum += l.firstContactedAt.getTime() - l.assignedAt.getTime();
        respCount++;
      }
    }
  }

  const revenueMyr = sales.reduce((acc, s) => {
    if (s.status && CLOSED_LIKE.has(s.status) && s.revenueValue != null) {
      return acc + s.revenueValue;
    }
    return acc;
  }, 0);

  const closeRate =
    outcomes === 0 ? 0 : (approved + closed) / outcomes;
  const approvalRate =
    outcomes === 0 ? 0 : (approved + closed) / outcomes;
  const slaCompliancePct =
    withSlaScope === 0 ? 100 : (slaOk / withSlaScope) * 100;
  const avgResponseMs = respCount === 0 ? null : Math.round(respSum / respCount);

  return {
    assigned,
    contacted,
    pending,
    approved,
    rejected,
    closed,
    unreachable,
    closeRate: round(closeRate, 4),
    approvalRate: round(approvalRate, 4),
    avgResponseMs,
    slaCompliancePct: round(slaCompliancePct, 1),
    revenueMyr: round(revenueMyr, 2),
  };
}

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}
