/**
 * The seven per-streamer chart titles, in render order.
 *
 * They live in their own module — with no `"use client"` on it — for one
 * boring, load-bearing reason: `live-analysis.tsx` is a **server** component and
 * needs the count for its `Disclosure` label, while `live-analysis-charts.tsx`
 * is a client component and needs the strings themselves.
 *
 * A server component may only ever pass a `"use client"` module's exports
 * through as JSX; it cannot read their values. Next's flight loader replaces
 * every export of a client module with a `registerClientReference` stub, so
 * `import { CHART_COUNT } from "./live-analysis-charts"` hands the server a
 * function, not `7` — and `${CHART_COUNT} charts` renders that function's source
 * text into the page heading, on desktop as well as on a phone. TypeScript sees
 * `number` throughout and says nothing.
 *
 * A plain module compiles into both graphs, so both sides read the same list and
 * the count is still derived rather than typed twice.
 */

export const LIVE_ANALYSIS_CHART_TITLES = [
  "Live Duration by Date",
  "Total Viewers per Session",
  "Daily Average Watch Time",
  "Daily Direct Messages",
  "Views",
  "Product mix vs leads",
  "Leads by time of day",
] as const;

/** For the collapsed section's "7 charts" label. Derived, never typed twice. */
export const CHART_COUNT = LIVE_ANALYSIS_CHART_TITLES.length;
