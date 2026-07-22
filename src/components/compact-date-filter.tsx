"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RangeChoice } from "@/lib/date-range";

/**
 * Compact, Google-Ads-style date filter: a single button showing the current
 * range that opens a dropdown of presets + a custom start/end picker, flanked by
 * ‹ › arrows to step the window back/forward. Saves the horizontal space the old
 * chip row + inline date inputs used. Navigates by pushing `range=` or
 * `start=&end=` to `basePath` (read server-side by `rangeFromParams`).
 *
 * Date maths runs against the browser's local day (= Malaysia time for the team)
 * and is deferred to after mount / popover-open so SSR and client agree.
 */
export function CompactDateFilter({
  basePath,
  choice,
  extraParams,
  align = "end",
}: {
  basePath: string;
  choice: RangeChoice;
  /** Extra query params to keep on every navigation (e.g. a selected handle). */
  extraParams?: Record<string, string>;
  /**
   * Which edge the dropdown lines up with. "end" (default) suits a filter sitting
   * at the right of a header — the panel opens leftwards into the page. Use
   * "start" when the filter is the LEFTMOST control, or the panel opens off the
   * side of the screen and gets clipped.
   */
  align?: "start" | "end";
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState<Date | null>(null);
  const [customStart, setCustomStart] = useState(choice.startStr);
  const [customEnd, setCustomEnd] = useState(choice.endStr);

  // Compute "today" only after mount so server-render (UTC) never disagrees with
  // the client (MYT) and trips a hydration warning.
  useEffect(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    setToday(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function push(params: Record<string, string>) {
    const merged = { ...(extraParams ?? {}), ...params };
    router.push(`${basePath}?${new URLSearchParams(merged).toString()}`);
    setOpen(false);
  }
  const goRange = (key: string) => push({ range: key });
  const goDates = (start: string, end: string) => push({ start, end });

  const triggerLabel =
    choice.mode === "preset"
      ? choice.label
      : choice.startStr === choice.endStr
        ? pretty(choice.startStr)
        : `${pretty(choice.startStr)} – ${pretty(choice.endStr)}`;

  // Step the current window back/forward by its own length.
  function shift(dir: -1 | 1) {
    const s = parseYmd(choice.startStr);
    const e = parseYmd(choice.endStr);
    const len = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
    s.setDate(s.getDate() + dir * len);
    e.setDate(e.getDate() + dir * len);
    goDates(ymd(s), ymd(e));
  }
  const nextDisabled = today ? parseYmd(choice.endStr) >= today : false;

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1 text-sm">
      <button
        onClick={() => shift(-1)}
        aria-label="Previous period"
        className={arrowCls}
      >
        ‹
      </button>

      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border border-blue-500 bg-white dark:bg-zinc-950 px-3 py-1.5 font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        <span className="whitespace-nowrap">{triggerLabel}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <button
        onClick={() => !nextDisabled && shift(1)}
        disabled={nextDisabled}
        aria-label="Next period"
        className={`${arrowCls} disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        ›
      </button>

      {open && today && (
        <div
          className={`absolute top-full z-40 mt-2 w-[260px] max-w-[calc(100vw-1.5rem)] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-lg p-2 ${
            align === "start" ? "left-0" : "left-0 sm:left-auto sm:right-0"
          }`}
        >
          <div className="grid grid-cols-2 gap-1">
            {presetsFor(today, choice).map((p) => (
              <button
                key={p.label}
                onClick={() => (p.range ? goRange(p.range) : goDates(p.start!, p.end!))}
                className={`text-left rounded-md px-2.5 py-1.5 text-sm ${
                  p.active
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-2 border-t border-zinc-200 dark:border-zinc-800 pt-2">
            <div className="px-1 text-xs font-medium text-zinc-500 mb-1.5">Custom range</div>
            <div className="flex items-center gap-1.5 px-1">
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(e) => setCustomStart(e.target.value)}
                className={inputCls}
                aria-label="Start date"
              />
              <span className="text-zinc-400">–</span>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(e) => setCustomEnd(e.target.value)}
                className={inputCls}
                aria-label="End date"
              />
            </div>
            <button
              onClick={() => customStart && customEnd && goDates(customStart, customEnd)}
              className="mt-2 w-full rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-3 py-1.5 text-sm font-medium"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Preset = {
  label: string;
  active: boolean;
  range?: string;
  start?: string;
  end?: string;
};

function presetsFor(today: Date, choice: RangeChoice): Preset[] {
  const off = (n: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + n);
    return x;
  };
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  const isDates = (s: string, e: string) =>
    choice.mode === "custom" && choice.startStr === s && choice.endStr === e;

  const T = ymd(today);
  return [
    { label: "Today", start: T, end: T, active: isDates(T, T) },
    { label: "Yesterday", start: ymd(off(-1)), end: ymd(off(-1)), active: isDates(ymd(off(-1)), ymd(off(-1))) },
    { label: "Last 7 days", range: "7d", active: choice.presetKey === "7d" },
    { label: "Last 14 days", start: ymd(off(-13)), end: T, active: isDates(ymd(off(-13)), T) },
    { label: "Last 30 days", range: "30d", active: choice.presetKey === "30d" },
    { label: "Last 90 days", range: "90d", active: choice.presetKey === "90d" },
    { label: "This month", start: ymd(firstOfMonth), end: T, active: isDates(ymd(firstOfMonth), T) },
    { label: "Last month", start: ymd(firstOfLastMonth), end: ymd(lastOfLastMonth), active: isDates(ymd(firstOfLastMonth), ymd(lastOfLastMonth)) },
    { label: "All time", range: "all", active: choice.presetKey === "all" },
  ];
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function pretty(s: string): string {
  return parseYmd(s).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const arrowCls =
  "flex h-8 w-7 items-center justify-center rounded-md text-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800";
const inputCls =
  "min-w-0 flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100";
