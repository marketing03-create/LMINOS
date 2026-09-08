"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/mobile/sheet";

/**
 * One 48px row that stands in for a whole filter bar: `‹ [ 30 days · All
 * streamers ▾ ] ›`, with the real controls one tap away inside a `Sheet`.
 *
 * The problem it solves is arithmetic. `OverviewFilters` pins a date button, a
 * date range caption, two selects, a "?" and an Export link in one wrapping
 * flex row; at 375px that wraps to three or four lines — 150–180px of
 * permanently sticky chrome, roughly a quarter of a 667px viewport, spent on
 * controls that are touched maybe twice a session. The numbers people actually
 * came to read start below the fold. Collapsing all of it to one row buys that
 * space back and keeps the whole bar inside the 64px sticky budget.
 *
 * Why the ‹ › arrows stay OUT of the sheet: stepping the window back one period
 * ("how did last week look?") is the cheapest and most repeated comparison both
 * a manager and a streamer make. Burying it behind two taps and a scroll would
 * be trading the common gesture for the rare one. They are the one thing here
 * worth 44×44 of permanent screen.
 *
 * Why this component navigates nothing: the range + streamer + agg merge is
 * subtle (every control has to carry the others' state back, or stepping the
 * date silently resets the page to "All streamers") and it already exists,
 * once, in `OverviewFilters.push()` / `CompactDateFilter`. So `FilterBar` is
 * pure chrome — the caller passes its own controls as `children` and its own
 * `push()` as `onPrev`/`onNext`, and the byte-for-byte URL contract stays where
 * it is. Do not reimplement `presetsFor` / `shift` / `ymd` in here.
 *
 * Why it hides ITSELF at `lg` rather than trusting each caller to wrap it: this
 * row replaces a desktop bar that stays exactly where it is (P5 — mobile markup
 * is a `lg:hidden` sibling of `hidden lg:block` desktop markup, never a swap).
 * Four call sites each remembering their own wrapper is four chances to ship two
 * filter bars stacked on a laptop, and that is the one regression nobody catches
 * on the phone they were testing on. So the caller keeps its existing bar in a
 * `hidden lg:block` sibling and wraps nothing.
 */

export type FilterBarProps = {
  /** The state of every filter, in one line: "30 days · All streamers". */
  summary: string;
  /** Step the period back. Omit and the ‹ arrow is not rendered. */
  onPrev?: () => void;
  /** Step the period forward. Omit and the › arrow is not rendered. */
  onNext?: () => void;
  /** True when the window already ends today — there is no forward to go. */
  nextDisabled?: boolean;
  /** A navigation is in flight; dims the row and announces it. */
  pending?: boolean;
  /** The real controls. Rendered inside the sheet, never in the row. */
  children: React.ReactNode;
  /** Sits at the end of the visible row, e.g. a handle chip. */
  trailing?: React.ReactNode;
};

export function FilterBar({
  summary,
  onPrev,
  onNext,
  nextDisabled,
  pending,
  children,
  trailing,
}: FilterBarProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  // The row is `lg:hidden`, but the sheet is portalled to <body>, so that class
  // cannot hide it. Widen the window past `lg` with the sheet up and you are
  // left with a modal, focus-trapped panel whose trigger no longer exists —
  // nothing on screen to close it from, and a focus restore that lands on a
  // `display:none` button (i.e. on <body>). Close at the same breakpoint the row
  // disappears at, as `HelpChip` does in `metric-help-sheet.tsx`. Subscription
  // only, no `matches` check on attach: `open` can only be set by a tap on a
  // button that is itself `lg:hidden`, so the window was narrow one render ago
  // and the listener is what catches it widening. (Checking `matches` here
  // instead would be a setState in an effect body —
  // `react-hooks/set-state-in-effect`.)
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open]);

  return (
    <>
      <div
        aria-busy={pending ? true : undefined}
        className={`flex min-h-12 items-center gap-1 transition-opacity lg:hidden ${
          pending ? "opacity-60" : ""
        }`}
      >
        {onPrev && (
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous period"
            className={`${arrowCls} ${arrowPressCls}`}
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-full border border-blue-500 bg-white px-4 text-sm font-medium text-zinc-900 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-zinc-950 dark:text-zinc-100 dark:active:bg-zinc-800"
        >
          {/* Truncated only in the row. The string is intact in the DOM (so a
              screen reader reads all of it) and is repeated, wrapping, at the
              top of the sheet — nothing is actually lost to the ellipsis. */}
          <span className="truncate">{summary}</span>
          <span className="sr-only">Change filters</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-blue-500"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {/* `aria-disabled`, not `disabled`. Tapping › until the window ends
            today is the normal way to reach this state, and a real `disabled`
            would blank the browser's focus at that exact moment — a keyboard or
            switch user is dumped on <body> and has to tab in from the top of the
            page again. Left focusable, it announces "dimmed" and stays put. */}
        {onNext && (
          <button
            type="button"
            onClick={() => {
              if (!nextDisabled) onNext();
            }}
            aria-disabled={nextDisabled || undefined}
            aria-label="Next period"
            className={`${arrowCls} ${
              nextDisabled ? "cursor-not-allowed opacity-30" : arrowPressCls
            }`}
          >
            <span aria-hidden="true">›</span>
          </button>
        )}

        {/* `shrink-0`: a chip that shrinks is a chip with clipped text. Keep
            whatever goes here compact — the summary pill is the one thing in
            this row allowed to absorb a narrow viewport. */}
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>

      {/* The dimmed row is invisible to a screen reader, so say it out loud.
          Empty (not absent) when idle, or the region has nothing to update. */}
      <span role="status" aria-live="polite" className="sr-only lg:hidden">
        {pending ? "Updating results" : ""}
      </span>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filters"
        footer={
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-base font-medium text-white active:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Done
          </button>
        }
      >
        {/* Deliberately not auto-closing on a pick: people change two filters
            at a time (streamer AND period), and a sheet that vanished after the
            first would cost a second round trip. Done closes it. */}
        <div className="space-y-4 py-1">
          <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {summary}
          </p>
          {children}
        </div>
      </Sheet>
    </>
  );
}

// 44×44 (P2) even though the glyph is one character — these are the two most
// repeated taps on the screen. Split in two because the pressed state has to
// come off the › arrow when it is aria-disabled, and a stacked Tailwind variant
// (`aria-disabled:active:…`) leaves that to stylesheet ordering rather than to
// something you can read here.
const arrowCls =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-300";
const arrowPressCls = "active:bg-zinc-100 dark:active:bg-zinc-800";
