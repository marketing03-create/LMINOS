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
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Resolve a date range from URL search params. A valid custom start+end wins;
 * otherwise a named preset; otherwise the 7-day default. End is made exclusive
 * at next-day midnight so the chosen end day is included.
 */
export function rangeFromParams(sp: {
  range?: string;
  start?: string;
  end?: string;
}): RangeChoice {
  if (sp.start && sp.end && ISO.test(sp.start) && ISO.test(sp.end)) {
    const start = new Date(`${sp.start}T00:00:00.000Z`);
    const endExcl = new Date(`${sp.end}T00:00:00.000Z`);
    endExcl.setUTCDate(endExcl.getUTCDate() + 1);
    return {
      range: { start, end: endExcl },
      label: `${sp.start} → ${sp.end}`,
      mode: "custom",
      presetKey: null,
      startStr: sp.start,
      endStr: sp.end,
    };
  }

  const preset = RANGE_PRESETS.find((p) => p.key === sp.range) ?? RANGE_PRESETS[0];
  const now = new Date();
  const endExcl = new Date(now);
  endExcl.setUTCHours(0, 0, 0, 0);
  endExcl.setUTCDate(endExcl.getUTCDate() + 1); // include today
  const start =
    preset.key === "all"
      ? new Date("2025-01-01T00:00:00.000Z")
      : new Date(now.getTime() - preset.days * 86_400_000);
  start.setUTCHours(0, 0, 0, 0);
  return {
    range: { start, end: endExcl },
    label: preset.label,
    mode: "preset",
    presetKey: preset.key,
    startStr: ymd(start),
    endStr: ymd(now),
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
