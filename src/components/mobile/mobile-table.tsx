"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * The one place the "below `lg`, a table is not a table" rule is enforced.
 *
 * Every wide grid in this app has the same failure on a phone, and it is always
 * invisible on a laptop: `sessions-table` is ~2,000px wide inside an
 * `overflow-auto max-h-[70vh]` box that is itself nested in the page scroll, so
 * at 375px you get a two-axis scroll trap where only "When" is on screen and
 * Total Leads is column 21, about 1,800px to the right. `streamer-table` is
 * `min-w-[52rem]` with a sticky handle column leaving ~230px for eleven
 * scrolling columns. Nobody reads either of those with a thumb.
 *
 * So a caller hands us both renderings of the same data and we pick by
 * viewport: the untouched `<table>` at `lg+`, a `RecordList` of `RecordCard`s
 * below it. Both arrive as props, which is the whole trick — they are rendered
 * by the server component that already had the rows, so putting this client
 * wrapper between them costs zero hydration and does not serialise 500 session
 * rows across the boundary a second time. Nothing here reads the data; it only
 * decides which subtree is visible.
 *
 * Why an escape hatch (fix F13): a card list genuinely answers "who is ahead on
 * one thing" worse than a scrollable grid answers "rank these twelve metrics",
 * and a manager on a landscape phone or a 900px tablet lands below `lg` and
 * gets cards whether that suits the question or not. Rather than apologise for
 * it in standing copy ("the full breakdown is on desktop"), we give them a
 * 44px button that unhides the real grid. It is local `useState` on purpose —
 * no URL parameter (the `range`/`streamer`/`agg` contract stays byte-for-byte)
 * and no storage (a preference that survives a week is a preference nobody
 * remembers setting, and it would silently hand a phone the 2,000px grid).
 *
 * The grid wrapper gets `overflow-x-auto` only while it is escaped, so a table
 * that does not carry its own scroll box still cannot make the whole page pan
 * sideways. At `lg` the overflow goes back to `visible`, so desktop renders
 * exactly the DOM and exactly the box it rendered before this component
 * existed — which is the only version of P5 that can actually be verified with
 * a screenshot diff. `overscroll-x` is reverted at `lg` for the same reason: an
 * escaped grid that survives a resize to desktop must leave nothing behind.
 *
 * The one non-obvious line is the focus move. The grid sits ABOVE the button in
 * the DOM — it has to, because at `lg` that order is the only order the page
 * had before this component existed — so pressing "Show the full grid" reveals
 * content behind you, which a screen reader says nothing about and a keyboard
 * user has to shift-tab to find. We therefore focus the grid wrapper on escape.
 * `tabIndex={-1}` and the label only exist while escaped, so the desktop render
 * has no tab stop, no landmark and no attribute it did not have before; and a
 * focused wrapper is also what makes an `overflow-x-auto` box arrow-scrollable,
 * which is the same WCAG 2.1.1 hole every hand-rolled scroll table in this app
 * has today.
 */

export type MobileTableProps = {
  /** The EXISTING `<table>`, untouched. Rendered at `lg+` (and on escape). */
  table: React.ReactNode;
  /** The same data as a `RecordList` of `RecordCard`s. Rendered below `lg`. */
  cards: React.ReactNode;
  escapeLabel?: string;
  allowEscape?: boolean;
};

export function MobileTable({
  table,
  cards,
  escapeLabel = "Show the full grid",
  allowEscape = true,
}: MobileTableProps): React.JSX.Element {
  // Always starts false, so the server and the first client render agree and
  // a phone never pays for the grid it did not ask for.
  const [gridEscaped, setGridEscaped] = useState(false);
  const gridId = useId();
  const gridRef = useRef<HTMLDivElement>(null);

  const showGrid = allowEscape && gridEscaped;

  // `showGrid` can only be true after a tap (state starts false and there is no
  // URL or storage seed), so this never steals focus on mount or during
  // hydration — it only ever follows the user's own action.
  useEffect(() => {
    if (showGrid) gridRef.current?.focus();
  }, [showGrid]);

  return (
    <>
      <div
        id={gridId}
        ref={gridRef}
        tabIndex={showGrid ? -1 : undefined}
        role={showGrid ? "region" : undefined}
        aria-label={showGrid ? "Full data grid" : undefined}
        className={
          showGrid
            ? "block overflow-x-auto overscroll-x-contain outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:overflow-x-visible lg:overscroll-x-auto"
            : "hidden lg:block"
        }
      >
        {table}
      </div>

      <div className={showGrid ? "hidden" : "lg:hidden"}>{cards}</div>

      {allowEscape && (
        <div className="mt-3 flex justify-center lg:hidden">
          <button
            type="button"
            onClick={() => setGridEscaped((v) => !v)}
            aria-expanded={showGrid}
            aria-controls={gridId}
            className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-blue-600 dark:text-blue-400 active:bg-blue-50 dark:active:bg-blue-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950"
          >
            {showGrid ? "Back to cards" : escapeLabel}
          </button>
        </div>
      )}
    </>
  );
}
