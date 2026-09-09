"use client";

import { useSyncExternalStore } from "react";

/**
 * Is the viewport below Tailwind's `lg`? For the handful of places where the
 * answer has to be a JavaScript value rather than a CSS class.
 *
 * Almost everything in this redesign adapts with `lg:` prefixes, which is far
 * better: a class costs nothing, works before hydration, and cannot disagree
 * with itself. This hook exists for the residue that a class cannot reach —
 * Recharts takes its `height`, its `YAxis width` and its tick `interval` as
 * plain numbers on props, so "240 on a laptop, 200 on a phone" has to be a
 * number decided in JS. Reach for a `lg:` class first; come here only when the
 * value crosses into someone else's prop.
 *
 * Two details are load-bearing:
 *
 *  - The server snapshot is `false` — desktop-first. The server has no
 *    viewport, so it has to guess, and guessing "desktop" means the HTML that
 *    ships matches what a manager on a laptop is about to see. A phone reflows
 *    once after hydration; a laptop never reflows at all. Guessing the other way
 *    would make the primary surface the one that flickers (P5).
 *  - It goes through `useSyncExternalStore`, not an effect. React uses the
 *    server snapshot for the hydration render and then re-reads, so the real
 *    value lands during hydration instead of one painted frame later — with an
 *    effect the phone user watches every chart resize itself after paint.
 *
 * `1024px` rather than `64rem`, to match `.lm-sec`'s media query in globals.css
 * and `PaneSwitcher`'s, which are the two other places this breakpoint is
 * decided outside a class. Worth knowing: Tailwind's own `lg:` compiles to
 * `64rem`, so a reader who has raised their browser's default font size flips
 * the classes at a wider window than this hook flips the numbers. The only
 * consequence is a chart that is 240px tall next to mobile-sized type on one
 * unusual setup — not a broken layout — and one shared definition of the
 * breakpoint is worth more than chasing that.
 */

const DESKTOP_QUERY = "(min-width: 1024px)";

// `useSyncExternalStore` calls the snapshot reader on every render and
// `matchMedia` allocates a fresh MediaQueryList each call, so one lazily-created
// list for the module keeps that allocation off the render path. Lazily, because
// touching `window` at import time would break the server render.
let mql: MediaQueryList | null = null;

function getMql(): MediaQueryList {
  if (!mql) mql = window.matchMedia(DESKTOP_QUERY);
  return mql;
}

function subscribe(onStoreChange: () => void): () => void {
  const m = getMql();
  // Safari < 14 has no addEventListener on a MediaQueryList. Calling it there
  // would throw during hydration and take the whole page down, which is a far
  // worse outcome than a chart that is 40px too tall.
  if (typeof m.addEventListener === "function") {
    m.addEventListener("change", onStoreChange);
    return () => m.removeEventListener("change", onStoreChange);
  }
  m.addListener(onStoreChange);
  return () => m.removeListener(onStoreChange);
}

function readNarrow(): boolean {
  return !getMql().matches;
}

function readNarrowOnServer(): boolean {
  return false;
}

export function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribe, readNarrow, readNarrowOnServer);
}
