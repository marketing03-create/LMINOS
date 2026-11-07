/**
 * Shared date-range parsing for the dashboard date filters (presets + custom
 * start/end). Pure — no DB imports — so any feature can use it.
 */

/** A half-open [start, end) window; `end` is exclusive. */
export type DateRange = { start: Date; end: Date };

export const RANGE_PRESETS = [
  { key: "7d", days: 7, label: "7 days" },
  { key: "30d", days: 30, label: "30 days" },
  { key: "90d", days: 90, label: "90 days" },
  { key: "all", days: 0, label: "All time" },
] as const;

export type RangeChoice = {
  range: DateRange;
  label: string;
  mode: "preset" | "custom";
  presetKey: string | null;
  startStr: string; // YYYY-MM-DD, for <input type=date> + link preservation
  endStr: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MYT_MS = 8 * 60 * 60 * 1000; // Malaysia is UTC+8, no DST

/** YYYY-MM-DD (a Malaysia day) → that day's 12:00am, Malaysia time. */
const mytMidnight = (day: string) => new Date(Date.parse(`${day}T00:00:00+08:00`));
/** The Malaysia calendar day of an instant. */
const mytDay = (d: Date) => new Date(d.getTime() + MYT_MS).toISOString().slice(0, 10);
/** A Malaysia day plus n days. */
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * Resolve a date range from URL search params. A valid custom start+end wins;
 * otherwise a named preset; otherwise the 7-day default.
 *
 * Days are MALAYSIA days: the range runs from the first day's 12:00am to the
 * day after the last day's 12:00am (exclusive), Malaysia time. (It used to cut
 * at UTC midnight — 8:00am in Malaysia — so "4 Nov" ran 4 Nov 8am → 5 Nov
 * 7:59am and 5 Nov chats showed up in a 4 Nov filter.)
 */
export function rangeFromParams(sp: {
  range?: string;
  start?: string;
  end?: string;
}, now = new Date()): RangeChoice {
  if (sp.start && sp.end && ISO.test(sp.start) && ISO.test(sp.end)) {
    return {
      range: { start: mytMidnight(sp.start), end: mytMidnight(addDays(sp.end, 1)) },
      label: `${sp.start} → ${sp.end}`,
      mode: "custom",
      presetKey: null,
      startStr: sp.start,
      endStr: sp.end,
    };
  }

  const preset = RANGE_PRESETS.find((p) => p.key === sp.range) ?? RANGE_PRESETS[0];
  const today = mytDay(now);
  const first = preset.key === "all" ? "2025-01-01" : addDays(today, -preset.days);
  return {
    range: { start: mytMidnight(first), end: mytMidnight(addDays(today, 1)) }, // includes today
    label: preset.label,
    mode: "preset",
    presetKey: preset.key,
    startStr: first,
    endStr: today,
  };
}

/** Query-string fragment that preserves the active date selection on links. */
export function dateParamString(choice: RangeChoice): string {
  return choice.mode === "custom"
    ? `start=${choice.startStr}&end=${choice.endStr}`
    : `range=${choice.presetKey}`;
}

/** Thousands-separated integer, e.g. 12345 → "12,345". */
export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-MY");
}
