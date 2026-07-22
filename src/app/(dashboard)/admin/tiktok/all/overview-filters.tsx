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
}: {
  choice: RangeChoice;
  handles: { id: string; handle: string }[];
  /** Selected account id, or "all". */
  streamer: string;
  agg: Agg;
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
    router.push(`${BASE}?${qs.toString()}`);
  }

  return (
    <div className="sticky top-14 z-30 -mx-4 mb-6 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:top-0 dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="flex flex-wrap items-center gap-2">
        <CompactDateFilter
          basePath={BASE}
          choice={choice}
          extraParams={{ streamer, agg }}
        />

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
