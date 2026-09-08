"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { Sheet } from "@/components/mobile/sheet";
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
 *
 * Two panels, one state. At `lg+` the panel is the absolute popover it has
 * always been. Below `lg` the same `open` flag drives a `Sheet` instead, because
 * the popover is genuinely unusable on a phone: it is 260px wide, `main` carries
 * `overflow-x-clip`, and at 375px the right-hand column of presets is sliced off
 * with no way to scroll to it. `max-w-[calc(100vw-1.5rem)]` does not save it —
 * the clip happens at an ancestor, so only a portal escapes. Which panel is live
 * is decided by `matchMedia`, not by CSS, because the sheet portals to <body>
 * and a `lg:hidden` class on this row could never reach it.
 *
 * The controls themselves are shared markup, resized with responsive prefixes
 * only (`h-11 w-11 lg:h-8 lg:w-7`, `min-h-11 lg:min-h-0`) so the desktop boxes
 * come out at exactly the pixels they are today. Everything that navigates —
 * `push()`, the `range` / `start` / `end` param shape, the `extraParams` merge,
 * `basePath` — is untouched: this is presentation only, and the URL it emits is
 * read back byte-for-byte by `rangeFromParams` on the server.
 *
 * No per-button `focus-visible:` classes on purpose. `globals.css` already
 * paints a 2px ring on `:focus-visible` for every element in the app, so adding
 * one here would only change its colour — on desktop as well as on the phone.
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
   * side of the screen and gets clipped. Below `lg` this is moot: the sheet is
   * full-width and has no edge to line up with.
   */
  align?: "start" | "end";
}) {
  const router = useRouter();
  // Navigate inside a transition so the current page stays on screen while the
  // new data loads — no loading.tsx skeleton swap, no scroll reset.
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState<Date | null>(null);
  const [customStart, setCustomStart] = useState(choice.startStr);
  const [customEnd, setCustomEnd] = useState(choice.endStr);
  const isDesktop = useSyncExternalStore(subscribeLg, readLg, readLgOnServer);

  // Compute "today" only after mount so server-render (UTC) never disagrees with
  // the client (MYT) and trips a hydration warning.
  useEffect(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    setToday(t);
  }, []);

  // Click-outside and Escape belong to the popover only. Below `lg` the sheet
  // owns both — and worse, this listener would actively break it: the sheet is
  // portalled to <body>, so `ref` does not contain it, and the mousedown that
  // begins a tap on a preset would read as "outside", unmount the sheet, and
  // swallow the click that was about to navigate.
  useEffect(() => {
    if (!open || !isDesktop) return;
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
  }, [open, isDesktop]);

  function push(params: Record<string, string>) {
    const merged = { ...(extraParams ?? {}), ...params };
    setOpen(false); // close the popover immediately (urgent, outside the transition)
    // scroll: false + transition → the page stays put and only the data swaps,
    // instead of the loading skeleton flashing and throwing the reader to the top.
    startTransition(() => {
      router.push(`${basePath}?${new URLSearchParams(merged).toString()}`, {
        scroll: false,
      });
    });
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
  const canApply = Boolean(customStart && customEnd);

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
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-blue-500 bg-white dark:bg-zinc-950 px-3 py-1.5 font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900 active:bg-zinc-100 dark:active:bg-zinc-800 lg:min-h-0"
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
          className={`absolute top-full z-40 mt-2 hidden w-[260px] max-w-[calc(100vw-1.5rem)] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-lg p-2 lg:block ${
            align === "start" ? "left-0" : "left-0 sm:left-auto sm:right-0"
          }`}
        >
          <Presets
            today={today}
            choice={choice}
            onRange={goRange}
            onDates={goDates}
            variant="popover"
          />

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
              onClick={() => canApply && goDates(customStart, customEnd)}
              className="mt-2 w-full rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-3 py-1.5 text-sm font-medium"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Same `open`, same handlers, phone-sized boxes. Gated on `!isDesktop`
          rather than on a class, because a portalled sheet cannot be hidden by a
          breakpoint utility sitting on this row — widen the window with it up
          and you would be left with a focus-trapped modal on a laptop. */}
      <Sheet
        open={open && today !== null && !isDesktop}
        onClose={() => setOpen(false)}
        title="Date range"
      >
        {today && (
          <div className="space-y-5 py-1">
            <Presets
              today={today}
              choice={choice}
              onRange={goRange}
              onDates={goDates}
              variant="sheet"
            />

            {/* Apply sits with the two dates it applies, not in the sheet's
                pinned footer. A footer button reads as "commit this sheet", and
                nine of the eleven ways out of here are a preset that navigates
                on the tap — there would be nothing left for it to commit. */}
            <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Custom range
              </div>
              {/* Stacked, not the desktop's side-by-side pair: two native date
                  fields at 16px want ~150px each, and side by side at 375px the
                  browser starts eliding "dd/mm/yyyy" — a picker whose current
                  value you cannot read. */}
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
                    From
                  </span>
                  <input
                    type="date"
                    value={customStart}
                    max={customEnd || undefined}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className={sheetInputCls}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
                    To
                  </span>
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart || undefined}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className={sheetInputCls}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => canApply && goDates(customStart, customEnd)}
                disabled={!canApply}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-base font-medium text-white active:bg-blue-700 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/**
 * The preset list, written once and styled twice. Which label pushes `range=`
 * and which pushes `start=&end=` is the part that must never fork between the
 * popover and the sheet, so the mapping lives here and only the class strings
 * branch on `variant`.
 */
function Presets({
  today,
  choice,
  onRange,
  onDates,
  variant,
}: {
  today: Date;
  choice: RangeChoice;
  onRange: (key: string) => void;
  onDates: (start: string, end: string) => void;
  variant: "popover" | "sheet";
}) {
  const sheet = variant === "sheet";
  return (
    <div className={`grid grid-cols-2 ${sheet ? "gap-2" : "gap-1"}`}>
      {presetsFor(today, choice).map((p) => (
        <button
          key={p.label}
          type="button"
          aria-current={p.active ? "true" : undefined}
          onClick={() => (p.range ? onRange(p.range) : onDates(p.start!, p.end!))}
          className={
            sheet
              ? `flex min-h-11 items-center rounded-lg border px-3 text-sm ${
                  p.active
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium"
                    : "border-zinc-200 dark:border-zinc-800 active:bg-zinc-100 dark:active:bg-zinc-800"
                }`
              : `text-left rounded-md px-2.5 py-1.5 text-sm ${
                  p.active
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                }`
          }
        >
          {p.label}
        </button>
      ))}
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

/**
 * "Am I on a laptop?" — the one thing CSS cannot answer for us here, since the
 * sheet renders outside this subtree. Kept at module scope so every instance of
 * the filter on a page shares one MediaQueryList, and read lazily because
 * `window` does not exist when this module is first evaluated on the server.
 * The server snapshot is `false` (phone-first); nothing renders differently at
 * mount either way, because `open` starts closed, so hydration stays quiet.
 */
// `64rem`, not `1024px`: Tailwind v4 emits `lg:` as `@media (width >= 64rem)`, and
// `rem` in a media query is the browser's default font size, not `html { font-size }`.
// With a reader-enlarged default the two diverge, and between 1024px and `64rem`
// this control would have NO panel at all — the popover still `hidden` by CSS while
// `isDesktop` already suppressed the sheet. Same string as `help-tip.tsx` /
// `live-picker.tsx` / `metric-help-sheet.tsx`. At the default 16px root it is
// exactly 1024px, so desktop is unchanged.
const LG = "(min-width: 64rem)";
let lgQuery: MediaQueryList | null = null;
function lgMedia(): MediaQueryList {
  lgQuery ??= window.matchMedia(LG);
  return lgQuery;
}
function subscribeLg(onChange: () => void): () => void {
  const mq = lgMedia();
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function readLg(): boolean {
  return lgMedia().matches;
}
function readLgOnServer(): boolean {
  return false;
}

// 44×44 under a thumb, back to the original 32×28 at `lg` so the desktop header
// cluster keeps its exact spacing. `active:` alongside the existing `hover:`,
// because a finger never hovers — without it the arrow gives no feedback at all
// on the tap people repeat most on this control.
const arrowCls =
  "flex h-11 w-11 lg:h-8 lg:w-7 items-center justify-center rounded-md text-xl lg:text-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-100 dark:active:bg-zinc-800";
const inputCls =
  "min-w-0 flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100";
// `text-base sm:text-sm`: under 16px, iOS Safari zooms the whole viewport the
// moment the field takes focus, and the reader lands back on a page they then
// have to pinch out of.
const sheetInputCls =
  "h-12 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-base sm:text-sm text-zinc-900 dark:text-zinc-100";
