/**
 * Pure (DB-free, AI-free) core of the TikTok screenshot importer (Feature Q):
 * the Zod extraction schema, the screenshot-label → DB-column mapping, the
 * Claude prompt, and the grouping/merging of multiple images into one live each.
 * Kept separate from screenshot-extract.ts so it can be unit-tested without the
 * DB or the AI SDK (same pattern as ads-analyst-core.ts).
 */
import { z } from "zod";

// Reading numbers off a screenshot is simple vision (near-OCR), so it uses the
// FASTEST model — much quicker + cheaper than the analyst's Opus, and the human
// review step (current → new, editable) catches any misread before it saves.
// Override via env SCREENSHOT_MODEL for more accuracy if ever needed (e.g.
// anthropic/claude-sonnet-5, or ...opus-4-8 for max accuracy).
export const DEFAULT_SCREENSHOT_MODEL = "anthropic/claude-haiku-4-5";

/** DB metric columns on tiktok_live_sessions, split by how the connector treats them. */
export const AUTO_COLUMNS = [
  "totalViews",
  "peakViewers",
  "avgViewers",
  "totalLikes",
  "totalComments",
  "totalShares",
  "newFollowers",
] as const;
export const MANUAL_COLUMNS = [
  "uniqueViewers",
  "activeViewers",
  "avgWatchSeconds",
  "directMessages",
  "serviceBioViews",
  "interestedViewers",
  "diamonds",
  // Streamer/CS-entered only — never read from a screenshot (no such TikTok
  // metric), so they are intentionally absent from SCREENSHOT_TO_COLUMN below.
  // Total Leads = the deduped unique-lead count CS tracks (one per phone number,
  // so DM + WhatsApp contact of the same person counts once).
  "totalLeads",
  "filteredLeads",
] as const;
export type MetricColumn =
  | (typeof AUTO_COLUMNS)[number]
  | (typeof MANUAL_COLUMNS)[number];

const AUTO_SET = new Set<string>(AUTO_COLUMNS);

/** One screenshot → one extraction. Every metric nullable (a tab shows a subset). */
export const ScreenshotExtractionSchema = z.object({
  date: z
    .string()
    .nullable()
    .describe("Live date as YYYY-MM-DD (infer current year). null if not shown on this screenshot."),
  startTime: z
    .string()
    .nullable()
    .describe("Live start time, 24-hour HH:mm, Malaysia time. null if not shown."),
  durationMinutes: z.number().int().nullable().describe("Live duration in minutes. null if not shown."),
  handle: z.string().nullable().describe("Creator @handle WITHOUT the @, lowercased. null if not shown."),
  tab: z
    .enum(["viewership", "engagement", "diamonds", "congratulations", "other"])
    .describe("Which TikTok analytics view this screenshot shows."),
  totalViews: z.number().int().nullable().describe("Views (Viewership tab) OR the summary's 'Viewers' total."),
  uniqueViewers: z.number().int().nullable(),
  activeViewers: z.number().int().nullable(),
  peakConcurrentViewers: z.number().int().nullable().describe("'Peak concurrent viewers'."),
  avgConcurrentViewers: z.number().int().nullable().describe("'Average concurrent viewers'."),
  avgWatchSeconds: z.number().int().nullable().describe("'Average watch duration' in TOTAL SECONDS."),
  newFollowers: z.number().int().nullable(),
  comments: z.number().int().nullable(),
  likes: z.number().int().nullable(),
  shares: z.number().int().nullable(),
  directMessages: z.number().int().nullable(),
  serviceBioViews: z.number().int().nullable(),
  interestedViewers: z.number().int().nullable(),
  diamonds: z.number().int().nullable(),
});
export type ScreenshotExtraction = z.infer<typeof ScreenshotExtractionSchema>;

/** Extraction field → DB column. (Fields not listed are metadata: date/time/handle/tab.) */
export const SCREENSHOT_TO_COLUMN: Record<string, MetricColumn> = {
  totalViews: "totalViews",
  peakConcurrentViewers: "peakViewers",
  avgConcurrentViewers: "avgViewers",
  likes: "totalLikes",
  comments: "totalComments",
  shares: "totalShares",
  newFollowers: "newFollowers",
  uniqueViewers: "uniqueViewers",
  activeViewers: "activeViewers",
  avgWatchSeconds: "avgWatchSeconds",
  directMessages: "directMessages",
  serviceBioViews: "serviceBioViews",
  interestedViewers: "interestedViewers",
  diamonds: "diamonds",
};

/** Non-null metric fields of one extraction → DB-column values (rounded ints). */
export function extractionToValues(
  e: ScreenshotExtraction
): Partial<Record<MetricColumn, number>> {
  const out: Partial<Record<MetricColumn, number>> = {};
  for (const [field, col] of Object.entries(SCREENSHOT_TO_COLUMN)) {
    const v = (e as unknown as Record<string, unknown>)[field];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out[col] = Math.round(v);
    }
  }
  return out;
}

/** Split a value set into "corrections to captured numbers" vs "new extras". */
export function splitByBucket(values: Partial<Record<MetricColumn, number>>): {
  auto: Partial<Record<MetricColumn, number>>;
  manual: Partial<Record<MetricColumn, number>>;
} {
  const auto: Partial<Record<MetricColumn, number>> = {};
  const manual: Partial<Record<MetricColumn, number>> = {};
  for (const [col, val] of Object.entries(values) as [MetricColumn, number][]) {
    if (AUTO_SET.has(col)) auto[col] = val;
    else manual[col] = val;
  }
  return { auto, manual };
}

export type MergedGroup = {
  key: string;
  date: string | null;
  handle: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  values: Partial<Record<MetricColumn, number>>;
  sourceTabs: string[];
  conflicts: string[];
  /** No date on the screenshot → the admin must pick which live to attach it to. */
  needsAttach: boolean;
};

/**
 * Merge per-image extractions into one group per live. Dated images are grouped
 * by date (so the Viewership + Engagement tabs of the same live combine, even if
 * only one shows the date); undated images (the LIVE-Centre summary) become
 * standalone "needs attach" groups. First non-null value wins; disagreements are
 * recorded as conflicts (never silently overwritten).
 */
export function mergeExtractions(
  extractions: ScreenshotExtraction[]
): MergedGroup[] {
  const dated = new Map<string, MergedGroup>();
  const undated: MergedGroup[] = [];

  extractions.forEach((e, i) => {
    const values = extractionToValues(e);
    if (!e.date) {
      undated.push({
        key: `undated-${i}`,
        date: null,
        handle: e.handle,
        startTime: e.startTime,
        durationMinutes: e.durationMinutes,
        values,
        sourceTabs: [e.tab],
        conflicts: [],
        needsAttach: true,
      });
      return;
    }
    let g = dated.get(e.date);
    if (!g) {
      g = {
        key: e.date,
        date: e.date,
        handle: e.handle,
        startTime: e.startTime,
        durationMinutes: e.durationMinutes,
        values: {},
        sourceTabs: [],
        conflicts: [],
        needsAttach: false,
      };
      dated.set(e.date, g);
    }
    if (e.handle && g.handle && e.handle !== g.handle)
      g.conflicts.push(`two handles seen (@${g.handle} vs @${e.handle})`);
    if (g.handle == null) g.handle = e.handle;
    if (e.startTime && g.startTime && e.startTime !== g.startTime)
      g.conflicts.push(`two start times (${g.startTime} vs ${e.startTime}) — possibly two lives this day`);
    if (g.startTime == null) g.startTime = e.startTime;
    if (g.durationMinutes == null) g.durationMinutes = e.durationMinutes;
    g.sourceTabs.push(e.tab);
    for (const [col, val] of Object.entries(values) as [MetricColumn, number][]) {
      if (g.values[col] == null) g.values[col] = val;
      else if (g.values[col] !== val)
        g.conflicts.push(`${col}: ${g.values[col]} vs ${val} (kept first)`);
    }
  });

  const datedGroups = [...dated.values()];

  // If exactly ONE dated live is in this batch, fold any undated summary (the
  // LIVE-Centre "Congratulations" screen — Direct messages / Service bio views /
  // Interested viewers) straight into it, so the reviewer sees ONE table with
  // those under "New extras". The dated screens are the more precise source, so
  // on any overlap the dated value wins (the undated value is recorded as a
  // conflict, never overwritten). With 0 or ≥2 dated lives we can't know which
  // live an undated screen belongs to, so it stays a "needs attach" group.
  if (datedGroups.length === 1 && undated.length > 0) {
    const g = datedGroups[0];
    for (const u of undated) {
      if (g.handle == null) g.handle = u.handle;
      if (g.startTime == null) g.startTime = u.startTime;
      if (g.durationMinutes == null) g.durationMinutes = u.durationMinutes;
      for (const t of u.sourceTabs) g.sourceTabs.push(t);
      for (const [col, val] of Object.entries(u.values) as [MetricColumn, number][]) {
        if (g.values[col] == null) g.values[col] = val;
        else if (g.values[col] !== val)
          g.conflicts.push(
            `${col}: ${g.values[col]} vs ${val} (kept the dated screenshot's value)`
          );
      }
    }
    return [g];
  }

  return [...datedGroups, ...undated];
}

export const SCREENSHOT_SYSTEM = `You read ONE screenshot of TikTok's LIVE analytics for a Malaysian creator and extract the numbers EXACTLY as shown. All times are Malaysia time (UTC+8).

RULES:
- Identify the tab: "viewership" (Views, Unique viewers, Active viewers, Average watch duration, Peak/Average concurrent viewers), "engagement" (Gifters, New followers, Comments, Shares, Likes), "diamonds", "congratulations" (the LIVE Centre summary: a "Viewers" total, New followers, Comments, Direct messages, Service bio views, Interested viewers), or "other".
- Only the Viewership tab and the LIVE-Centre summary show the live's DATE/TIME at the top (e.g. "10 Jun, 12:55 pm · 51 mins"). If shown: date = YYYY-MM-DD (infer the current year), startTime = 24h HH:mm, durationMinutes = the minutes. If NOT shown on this screenshot, set date, startTime and durationMinutes to null — DO NOT guess.
- Return the @handle (without @, lowercased) only if visible, else null.
- EVERY metric must be a plain INTEGER. Expand shorthand: "3.1K" → 3100, "1.2M" → 1200000. Strip commas: "1,703" → 1703. Average watch duration → TOTAL SECONDS: "0m52s" → 52, "1m30s" → 90.
- Label mapping: "Views" OR the LIVE-Centre summary's "Viewers" total → totalViews; "Unique viewers" → uniqueViewers; "Active viewers" → activeViewers; "Peak concurrent viewers" → peakConcurrentViewers; "Average concurrent viewers" → avgConcurrentViewers; "Average watch duration" → avgWatchSeconds; "New followers" → newFollowers; "Comments" → comments; "Likes" → likes; "Shares" → shares; "Direct messages" → directMessages; "Service bio views"/"Profile bio views" → serviceBioViews; "Interested viewers" → interestedViewers; "Diamonds" → diamonds.
- If a metric is NOT visible on THIS screenshot, return null for it. Never invent a number. Never return 0 unless the screenshot literally shows 0.`;

export function buildScreenshotPrompt(): string {
  return "Extract the date, start time, @handle, tab, and every visible metric from this TikTok LIVE analytics screenshot, following the rules exactly. Use null for anything not shown on this screenshot.";
}
