"use client";

import { useRouter } from "next/navigation";
import { CompactDateFilter } from "@/components/compact-date-filter";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";
import { AGG_LABEL, AGGREGATIONS, type Agg } from "@/lib/tiktok-live/live-analysis-core";
import type { RangeChoice } from "@/lib/date-range";

const BASE = "/admin/tiktok/all";

/**
 * The Overview's three filters in one sticky bar: date, streamer, and how to
 * combine the charts.
 *
 * All three live in the URL, so every one of them survives the others changing —
 * `CompactDateFilter` merges `extraParams` into each push, and the two selects
 * carry the current date selection back. Without that, stepping the date arrow
 * would silently reset the page to "All streamers".
 *
 * Native <select> on purpose (as elsewhere in the app): each device renders its
 * own picker, so it can't look broken on mobile.
 */
export function OverviewFilters({
  choice,
  handles,
  streamer,
  agg,
  exportHref,
}: {
  choice: RangeChoice;
  handles: { id: string; handle: string }[];
  /** Selected account id, or "all". */
  streamer: string;
  agg: Agg;
  /** CSV export for exactly the range + streamer currently shown. */
  exportHref: string;
}) {
  const router = useRouter();

  // The date params as they should appear on every link out of this bar.
  const dateParams: Record<string, string> =
    choice.mode === "custom"
      ? { start: choice.startStr, end: choice.endStr }
      : { range: choice.presetKey ?? "30d" };

  function push(next: Partial<{ streamer: string; agg: string }>) {
    const qs = new URLSearchParams({
      ...dateParams,
      streamer,
      agg,
      ...next,
    });
    // scroll: false → the cards, charts and tables re-render in place and the
    // page keeps its current scroll position, instead of jumping back to the top
    // every time a filter changes. It's still a soft navigation (URL updates,
    // server data refetches), just without the scroll reset.
    router.push(`${BASE}?${qs.toString()}`, { scroll: false });
  }

  return (
    <div className="sticky top-14 z-30 -mx-4 mb-6 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:top-0 dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="flex flex-wrap items-center gap-2">
        {/* align="start": this is the leftmost control, so the panel must open
            rightwards into the page. Right-aligned it runs off the side. */}
        <CompactDateFilter
          basePath={BASE}
          choice={choice}
          extraParams={{ streamer, agg }}
          align="start"
        />

        {/* The actual dates, next to the control that sets them. The filter
            button only says "30 days"; this is what those 30 days ARE, so the
            numbers below are never read against the wrong window. */}
        <span className="whitespace-nowrap text-xs tabular-nums text-zinc-500">
          {choice.startStr} → {choice.endStr}
        </span>

        <select
          value={streamer}
          onChange={(e) => push({ streamer: e.target.value })}
          aria-label="Filter by streamer"
          className={selectCls}
        >
          <option value="all">All streamers</option>
          {handles.map((h) => (
            <option key={h.id} value={h.id}>
              @{h.handle}
            </option>
          ))}
        </select>

        <label className="inline-flex items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500">Combine by</span>
          <select
            value={agg}
            onChange={(e) => push({ agg: e.target.value })}
            aria-label="How to combine the charts"
            className={selectCls}
          >
            {AGGREGATIONS.map((a) => (
              <option key={a} value={a}>
                {AGG_LABEL[a]}
              </option>
            ))}
          </select>
          <HelpTip text={METRIC_HELP.combineBy} label="What does Combine by do?" />
        </label>

        {/* ml-auto so it sits at the far end on desktop and simply wraps to the
            end of the row on mobile. */}
        <a
          href={exportHref}
          className="ml-auto inline-flex shrink-0 items-center rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Export CSV
        </a>
      </div>

      {/* The contract, stated once, so nobody wonders why the cards didn't move. */}
      <p className="mt-1.5 text-[11px] text-zinc-500">
        <strong className="font-medium">Combine by</strong> changes the charts only.
        The cards above them are always the period total. Charts marked{" "}
        <span className="rounded border border-zinc-200 px-1 dark:border-zinc-700">
          Pooled rate
        </span>{" "}
        work from the totals and can&apos;t be re-combined.
      </p>
    </div>
  );
}

const selectCls =
  "rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
