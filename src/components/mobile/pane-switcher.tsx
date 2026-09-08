"use client";

import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";

/**
 * Turns one very long admin page into a few short ones without splitting the
 * route, moving a single server component, or touching the URL.
 *
 * `/admin/tiktok/all` is ~2,000px of charts before the first table on a phone.
 * The obvious fixes were all worse:
 *
 *  - Separate routes would duplicate the query and the filter contract, and the
 *    bookmark everyone already has points here.
 *  - A hash-synced tab bar collides with the anchors this page already owns
 *    (`#results`, `#reach`, `#audience`, `#timing`, `#streamers`, `#lives`,
 *    `#data-quality`) and spams the back stack on every chip tap. So pane state
 *    is `useState` and nothing else: we never read or write `location.hash`,
 *    and those anchors keep working as ordinary scroll anchors.
 *  - Unmounting the inactive panes would re-measure every Recharts
 *    `ResponsiveContainer` on each switch. Panes are `display:none`, not
 *    unmounted, so switching costs a class change and nothing re-measures.
 *
 * The one exception is `mountGatedIds` (in practice: `charts`). Those panes
 * render `null` until first activated, so first paint does not pay for six
 * charts — and once mounted they stay mounted. There is a catch that is easy to
 * miss: at `lg+` every pane is *visible*, so a never-activated gated pane would
 * simply be absent from the desktop page. That is a desktop regression, which
 * P5 forbids. Hence the `matchMedia` read below — at `lg+` gating is off
 * entirely. It goes through `useSyncExternalStore` rather than an effect so the
 * real value lands during hydration instead of one painted frame later; with an
 * effect, the admin watches the charts pop in on every load.
 *
 * That same `matchMedia` read does one more job: it takes the tab roles off at
 * `lg+`. Tabs are a mobile affordance, and a tablist that is `display:none`
 * beside a full stack of visible tab panels is worse than no tabs at all for a
 * screen reader — desktop used to be plain divs, and P5 says desktop does not
 * change.
 *
 * Children arrive as props from the server page. That is what keeps this file
 * from dragging the tables and charts across the client boundary — the panes
 * are still server-rendered; this component only decides which one gets a box.
 */

export type Pane = {
  id: string;
  label: string;
  children: React.ReactNode;
};

export type PaneSwitcherProps = {
  panes: Pane[];
  defaultPaneId: string;
  /** Panes that render nothing until first activated. Used only for `charts`. */
  mountGatedIds?: string[];
};

const DESKTOP_QUERY = "(min-width: 1024px)";
const NO_IDS: string[] = [];

// `useSyncExternalStore` calls the snapshot reader on every render, and
// `matchMedia` allocates a fresh MediaQueryList each call. One lazily-created
// list for the module keeps that allocation off the render path — lazily,
// because touching `window` at import time would break the server render.
let desktopMql: MediaQueryList | null = null;

function getDesktopMql(): MediaQueryList {
  if (!desktopMql) desktopMql = window.matchMedia(DESKTOP_QUERY);
  return desktopMql;
}

function subscribeDesktop(onStoreChange: () => void): () => void {
  const mql = getDesktopMql();
  // Safari < 14 has no addEventListener on a MediaQueryList. Calling it there
  // would throw during hydration and take the whole page with it, which is a
  // far worse outcome than a chart pane mounting a little early.
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onStoreChange);
    return () => mql.removeEventListener("change", onStoreChange);
  }
  mql.addListener(onStoreChange);
  return () => mql.removeListener(onStoreChange);
}

function readDesktop(): boolean {
  return getDesktopMql().matches;
}

function readDesktopOnServer(): boolean {
  return false;
}

export function PaneSwitcher({
  panes,
  defaultPaneId,
  mountGatedIds,
}: PaneSwitcherProps): React.JSX.Element {
  const uid = useId();
  const gated = mountGatedIds ?? NO_IDS;

  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    readDesktop,
    readDesktopOnServer
  );

  // An unknown `defaultPaneId` falls back to the first pane rather than leaving
  // a page on which every pane is hidden.
  const fallbackId = panes.some((p) => p.id === defaultPaneId)
    ? defaultPaneId
    : (panes[0]?.id ?? "");

  const [wantedId, setWantedId] = useState(fallbackId);
  const activeId = panes.some((p) => p.id === wantedId) ? wantedId : fallbackId;

  const [everActive, setEverActive] = useState<string[]>(() => [fallbackId]);

  // Gating is off at `lg+`, and it stays off once we have ever been there. A
  // desktop window dragged back below 1024px flips `isDesktop` to false, and
  // without this latch every gated pane the admin had not tapped would unmount
  // on the way down — throwing away Recharts measurements and any in-pane
  // `useState` to save a mount cost that was already paid. Adjusting state
  // during render is the documented way to react to a changed value without
  // burning a second painted frame on an effect.
  const [everDesktop, setEverDesktop] = useState(false);
  if (isDesktop && !everDesktop) setEverDesktop(true);

  const stripRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState(() =>
    Math.max(
      0,
      panes.findIndex((p) => p.id === fallbackId)
    )
  );

  // Roving tabindex: exactly one chip is in the Tab order at a time. That index
  // is state, so it has to be clamped back into `panes` on every render — this
  // component stays mounted across navigations, and a route that hands us a
  // shorter array (a pane that only exists while there are lives, say) would
  // otherwise leave `focusIndex` pointing past the end. Then no chip carries
  // `tabIndex={0}` and the entire strip silently drops out of the Tab order.
  const focusPos = Math.min(Math.max(focusIndex, 0), Math.max(panes.length - 1, 0));

  const hasTabs = panes.length > 1;

  // Tab semantics are a *mobile* affordance and have to come off above the
  // breakpoint. At `lg+` the strip is `display:none` while every pane is
  // visible, so leaving the roles on would have a screen reader announce seven
  // unlabelled tab panels belonging to a tablist it can no longer reach — the
  // desktop DOM used to be plain divs, and P5 says desktop must not change.
  // Hence: above `lg` no roles, no ids, and no strip in the tree at all. The
  // `lg:hidden` class stays on the strip for the pre-hydration frame, where
  // `isDesktop` is still the server's `false`.
  const tabsActive = hasTabs && !isDesktop;

  // Scroll the strip by hand instead of `scrollIntoView`, which also scrolls
  // every scrollable ancestor — including the page — and would yank an admin
  // away from whatever they were reading just because a chip sat off-screen.
  const revealChip = useCallback((index: number) => {
    const strip = stripRef.current;
    const chip = chipRefs.current[index];
    if (!strip || !chip) return;
    const PAD = 16;
    const left = chip.offsetLeft - PAD;
    const right = chip.offsetLeft + chip.offsetWidth + PAD;
    let next = strip.scrollLeft;
    if (left < strip.scrollLeft) next = left;
    else if (right > strip.scrollLeft + strip.clientWidth)
      next = right - strip.clientWidth;
    if (next === strip.scrollLeft) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({
      left: Math.max(0, next),
      behavior: still ? "auto" : "smooth",
    });
  }, []);

  const select = useCallback((id: string, index: number) => {
    setWantedId(id);
    setFocusIndex(index);
    setEverActive((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  // Arrows move focus but do NOT select. Automatic activation would mount the
  // charts pane just because someone arrowed past it, which is the exact cost
  // `mountGatedIds` exists to avoid.
  function onStripKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const last = panes.length - 1;
    let next: number;
    if (e.key === "ArrowRight") next = focusPos >= last ? 0 : focusPos + 1;
    else if (e.key === "ArrowLeft") next = focusPos <= 0 ? last : focusPos - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    setFocusIndex(next);
    // `preventScroll` matters more than it looks: a plain `.focus()` on a chip
    // inside an `overflow-x-auto` strip lets the browser scroll every ancestor
    // to reveal it — including the page — which is exactly the yank `revealChip`
    // was written to avoid. Focus without scrolling, then scroll the strip
    // ourselves. Browsers without the option just fall back to today's
    // behaviour.
    chipRefs.current[next]?.focus({ preventScroll: true });
    revealChip(next);
  }

  return (
    <>
      {tabsActive && (
        <div
          ref={stripRef}
          role="tablist"
          aria-label="Sections"
          aria-orientation="horizontal"
          onKeyDown={onStripKeyDown}
          className="relative -mx-4 mb-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 py-1 lg:hidden"
        >
          {panes.map((pane, i) => {
            const selected = pane.id === activeId;
            return (
              <button
                key={pane.id}
                ref={(el) => {
                  chipRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${uid}-tab-${pane.id}`}
                aria-selected={selected}
                aria-controls={`${uid}-pane-${pane.id}`}
                tabIndex={i === focusPos ? 0 : -1}
                onFocus={() => setFocusIndex(i)}
                onClick={() => {
                  select(pane.id, i);
                  revealChip(i);
                }}
                className={`inline-flex min-h-11 shrink-0 snap-start items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white active:bg-blue-700"
                    : "border-zinc-300 bg-white text-zinc-600 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:active:bg-zinc-800"
                }`}
              >
                {pane.label}
              </button>
            );
          })}
        </div>
      )}

      {panes.map((pane) => {
        const shown = pane.id === activeId;
        const rendered =
          !gated.includes(pane.id) ||
          isDesktop ||
          everDesktop ||
          shown ||
          everActive.includes(pane.id);
        return (
          <div
            key={pane.id}
            id={tabsActive ? `${uid}-pane-${pane.id}` : undefined}
            role={tabsActive ? "tabpanel" : undefined}
            aria-labelledby={tabsActive ? `${uid}-tab-${pane.id}` : undefined}
            // `lg:contents` makes the wrapper generate no box at all at lg+, so
            // the desktop DOM lays out as the panes' own sections in source
            // order — the switcher leaves no trace above the breakpoint.
            className={shown ? "lg:contents" : "hidden lg:contents"}
          >
            {rendered ? pane.children : null}
          </div>
        );
      })}
    </>
  );
}
