/**
 * Lead status funnel ordering. Higher = further down the funnel.
 *
 * advanceStatus() only moves a lead status FORWARD (or to a terminal
 * outcome). We never let a sheet reset 'approved' back to 'pending'.
 *
 * Outcome statuses (rejected/closed/not_suitable/unreachable) replace
 * any earlier intake/middle status — even if rank is equal/lower —
 * because they are real-world final dispositions reported by the agent.
 */
export const FUNNEL_RANK = {
  new: 0,
  contacted: 1,
  pending: 2,
  unreachable: 3,
  not_suitable: 4,
  rejected: 5,
  approved: 6,
  closed: 7,
} as const;

export type FunnelStatus = keyof typeof FUNNEL_RANK;

const TERMINAL: FunnelStatus[] = [
  "rejected",
  "approved",
  "closed",
  "not_suitable",
  "unreachable",
];

export function shouldAdvance(
  current: FunnelStatus,
  incoming: FunnelStatus
): boolean {
  if (current === incoming) return false;
  // Once at a terminal state, only allow swapping to another terminal
  // that ranks higher (e.g. unreachable → rejected).
  if (TERMINAL.includes(current)) {
    return TERMINAL.includes(incoming) && FUNNEL_RANK[incoming] > FUNNEL_RANK[current];
  }
  return FUNNEL_RANK[incoming] > FUNNEL_RANK[current];
}

export function isRejectedLikeStatus(s: FunnelStatus): boolean {
  return s === "rejected" || s === "not_suitable";
}
