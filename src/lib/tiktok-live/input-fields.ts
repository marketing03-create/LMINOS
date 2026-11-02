/**
 * How the "Add live results" forms group a live's numbers. Pure (no db), so the
 * client forms can import it. input-fields.test.ts keeps it in step with the
 * columns the routes accept and with what the reminders chase.
 *
 *   required  — the four numbers every live is chased for (completeness.ts
 *               REQUIRED_METRICS): Total PM, Document Collect, DMs, Bio views.
 *   studio    — the rest of what the streamer reads off TikTok Studio.
 *   auto      — what the connector captures by itself; typed only to fix one.
 */
export const REQUIRED_FIELDS = [
  "totalLeads",
  "filteredLeads",
  "directMessages",
  "serviceBioViews",
] as const;

export const STUDIO_FIELDS = [
  "uniqueViewers",
  "activeViewers",
  "avgWatchSeconds",
  "interestedViewers",
  "diamonds",
] as const;

export const AUTO_FIELDS = [
  "totalViews",
  "peakViewers",
  "avgViewers",
  "totalLikes",
  "totalComments",
  "totalShares",
  "newFollowers",
] as const;

export const FIELD_LABEL: Record<string, string> = {
  totalLeads: "Total PM",
  filteredLeads: "Document Collect",
  directMessages: "Direct messages",
  serviceBioViews: "Service bio views",
  uniqueViewers: "Unique viewers",
  activeViewers: "Active viewers",
  avgWatchSeconds: "Avg watch (sec)",
  interestedViewers: "Interested viewers",
  diamonds: "Diamonds",
  totalViews: "Views",
  peakViewers: "Peak viewers",
  avgViewers: "Avg viewers",
  totalLikes: "Likes",
  totalComments: "Comments",
  totalShares: "Shares",
  newFollowers: "New followers",
};

/** How many of `cols` hold something in a form's string values. */
export function filledCount(cols: readonly string[], values: Record<string, string>): number {
  return cols.filter((c) => (values[c] ?? "").trim() !== "").length;
}

/** Required numbers still blank on a saved live (null = not entered). */
export function missingRequired(current: Record<string, number | null | undefined>): number {
  return REQUIRED_FIELDS.filter((c) => current[c] == null).length;
}
