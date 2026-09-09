"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CompactDateFilter } from "@/components/compact-date-filter";
import { HelpTip } from "@/components/help-tip";
import { Disclosure } from "@/components/mobile/disclosure";
import { FilterBar } from "@/components/mobile/filter-bar";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";
import { AGG_LABEL, AGGREGATIONS, type Agg } from "@/lib/tiktok-live/live-analysis-core";
import type { RangeChoice } from "@/lib/date-range";

const BASE = "/admin/tiktok/all";

/**
 * The Overview's three filters: date, streamer, and how to combine the charts.
 *
 * All three live in the URL, so every one of them survives the others changing —
 * `CompactDateFilter` merges `extraParams` into each push, and the two selects
 * carry the current date selection back. Without that, stepping the date arrow
 * would silently reset the page to "All streamers".
 *
 * Native <select> on purpose (as elsewhere in the app): each device renders its
 * own picker, so it can't look broken on mobile.
 *
 * Two bars, one `push()`. At `lg` this is the wrapping sticky row it has always
 * been. Below `lg` that row was 150–180px of permanently pinned chrome — about
 * a quarter of a 667px screen spent on controls touched twice a session, with
 * the numbers people came for starting below the fold. So the phone gets one
 * 48px `FilterBar` instead, with the same controls one tap away inside its
 * sheet. Sibling markup, not a swap (P5): the desktop bar is untouched below,
 * and nothing about the URL it emits changes.
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
  // startTransition keeps the CURRENT page on screen while the new data loads,
  // so React never shows the dashboard's loading.tsx skeleton (which is what
  // swaps the whole page out and resets scroll). Paired with scroll:false, the
  // reader stays exactly where they were and only the numbers change.
  const [isPending, startTransition] = useTransition();

  // The date params as they should appear on every link out of this bar.
  const dateParams: Record<string, string> =
    choice.mode === "custom"
      ? { start: choice.startStr, end: choice.endStr }
      : { range: choice.presetKey ?? "30d" };

  function push(next: Partial<{ streamer: string; agg: string; start: string; end: string }>) {
    const { start, end, ...rest } = next;
    const qs = new URLSearchParams({
      // A stepped window is always a custom start+end, and it REPLACES the
      // preset rather than riding alongside it. Note what the server actually
      // does: `rangeFromParams` (date-range.ts L38) prefers a valid start+end
      // OVER `range`, so a leftover `range=30d` would not change what renders.
      // It would still be wrong — it sits in a URL people copy, paste and
      // bookmark, labelling a stepped window "30 days". Drop it.
      ...(start && end ? { start, end } : dateParams),
      streamer,
      agg,
      ...rest,
    });
    startTransition(() => {
      router.push(`${BASE}?${qs.toString()}`, { scroll: false });
    });
  }

  /**
   * Step the window back/forward by its own length — the same three lines as
   * `CompactDateFilter.shift`, and deliberately so. That copy is private to a
   * component shared by five routes, and the phone's ‹ › arrows have to live
   * outside its sheet (they are the most repeated comparison anyone makes here,
   * per fix F14). The output is what matters and it is identical: a custom
   * `start`+`end` pair in browser-local days, read back by `rangeFromParams`.
   */
  function shift(dir: -1 | 1) {
    const s = parseYmd(choice.startStr);
    const e = parseYmd(choice.endStr);
    const len = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
    s.setDate(s.getDate() + dir * len);
    e.setDate(e.getDate() + dir * len);
    push({ start: ymd(s), end: ymd(e) });
  }

  const scopeLabel =
    streamer === "all"
      ? "All streamers"
      : `@${handles.find((h) => h.id === streamer)?.handle ?? "unknown"}`;

  return (
    <>
      {/* ── Phone: one 48px row ──────────────────────────────────────────
          `top-[calc(3rem+…)]` is the shell's own 48px bar plus whatever the
          notch takes, so this lands flush under it in PWA standalone instead
          of sliding beneath it. Total pinned height stays inside the 64px
          sticky budget (§2.4). */}
      <div className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-30 -mx-4 mb-4 border-b border-zinc-200 bg-white/95 px-4 py-1.5 backdrop-blur sm:-mx-8 sm:px-8 lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
        <FilterBar
          summary={`${choice.label} · ${scopeLabel}`}
          onPrev={() => shift(-1)}
          onNext={() => shift(1)}
          // A preset window always ends today, so forward is nowhere. Custom
          // windows are left live: knowing whether TODAY has passed needs a
          // clock, and reading one during render is a hydration mismatch
          // waiting for a midnight deploy. The date sheet's own › still
          // disables itself properly, and a step too far is one ‹ back.
          nextDisabled={choice.mode === "preset"}
          pending={isPending}
        >
          <div className="space-y-5">
            <div>
              <span className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Date range
              </span>
              {/* The real date control, not a second copy of it: presets, the
                  custom range and the `range=` / `start=&end=` contract are all
                  already here, and it opens its own sheet on top of this one
                  (Sheet stacks — see `sheetStack` in sheet.tsx). */}
              <CompactDateFilter
                basePath={BASE}
                choice={choice}
                extraParams={{ streamer, agg }}
                align="start"
              />
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Streamer
              </span>
              <select
                value={streamer}
                onChange={(e) => push({ streamer: e.target.value })}
                aria-label="Filter by streamer"
                className={sheetSelectCls}
              >
                <option value="all">All streamers</option>
                {handles.map((h) => (
                  <option key={h.id} value={h.id}>
                    @{h.handle}
                  </option>
                ))}
              </select>
            </label>

            {/* Collapsed, because "Combine by" changes the charts only and the
                charts are a pane nobody is looking at while they set filters.
                The explanation that used to stand permanently in the sticky bar
                is in here, where it costs nothing until someone asks. */}
            <div className="-mx-4">
              <Disclosure title="Chart options">
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      Combine by
                    </span>
                    {/* No `aria-label` here, unlike the desktop bar: the
                        wrapping <label> already names this "Combine by", and an
                        aria-label REPLACES that name rather than adding to it.
                        "How to combine the charts" does not contain the visible
                        words, which fails WCAG 2.5.3 (Label in Name) and leaves
                        a voice-control user with no way to say "Combine by".
                        The desktop select keeps its own attribute untouched. */}
                    <select
                      value={agg}
                      onChange={(e) => push({ agg: e.target.value })}
                      className={sheetSelectCls}
                    >
                      {AGGREGATIONS.map((a) => (
                        <option key={a} value={a}>
                          {AGG_LABEL[a]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {METRIC_HELP.combineBy}
                  </p>
                </div>
              </Disclosure>
            </div>

            <a
              href={exportHref}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-300 bg-white text-base font-medium text-zinc-700 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:active:bg-zinc-800"
            >
              Export CSV
            </a>
          </div>
        </FilterBar>
      </div>

      {/* ── Desktop: today's bar, unchanged ──────────────────────────────── */}
      <div
        aria-busy={isPending}
        className={`sticky top-14 z-30 -mx-4 mb-6 hidden border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur transition-opacity sm:-mx-8 sm:px-8 lg:top-0 lg:block dark:border-zinc-800 dark:bg-zinc-950/95 ${
          isPending ? "opacity-60" : ""
        }`}
      >
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
      </div>
    </>
  );
}

// Local-day maths, matching `CompactDateFilter`'s: the ‹ › step is a reader
// saying "the previous 30 days", which they mean in their own calendar.
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const selectCls =
  "rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
// `text-base`: under 16px iOS Safari zooms the viewport the moment the select
// takes focus, and the reader lands back on a page they have to pinch out of.
const sheetSelectCls =
  "h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base font-medium text-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
