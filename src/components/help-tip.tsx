"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Sheet } from "@/components/mobile/sheet";

/**
 * A small "?" button that reveals a short explanation on click.
 *
 * At `lg+` this is unchanged and stays unchanged: the popover is position:fixed
 * AND rendered in a portal to <body>, so it never runs off-screen and is never
 * clipped by an overflow/transformed ancestor (e.g. a scrollable table). Its
 * left/top are JS-clamped to the viewport. Click the button again, click
 * outside, or press Escape to close. Desktop uses these daily and the whole
 * mechanism is kept byte for byte.
 *
 * Below `lg` two things about that are wrong, and both are fixed here rather
 * than at the 13 call sites, because the props are frozen (contract 31):
 *
 *  - The panel is a hard 240px. A phone is 375px wide, so the explanation
 *    arrives narrower than the device holding it — and `main` carries
 *    `overflow-x-clip`, which is the same ancestor that clips
 *    `CompactDateFilter`. So below `lg` the tip becomes a `Sheet`: full width,
 *    scroll-locked, Escape-able, focus restored to the "?" on close.
 *  - The trigger is a 16px circle. It gets mobile-only hit-slop from a
 *    pseudo-element — `before:-inset-3` — rather than padding plus a negative
 *    margin. A pseudo-element generates no layout box, so desktop spacing is
 *    unchanged to the pixel, and the enlarged region cannot push a neighbour
 *    around in the 21-tip `sessions-table` header where these sit shoulder to
 *    shoulder inside one `whitespace-nowrap` row.
 *
 * `preventDefault()` on the click is not belt-and-braces. Several of these live
 * inside a card `<Link>`, and without it asking what a number means navigates
 * you away from the number. It works today; it keeps working.
 *
 * In practice the metric surfaces hide their "?" below `lg` and offer one
 * `HelpChip` per screen instead, so the sheet branch is a safety net for the
 * tips that survive at `md` rather than the common path. It is still the branch
 * that has to exist: a component cannot assume every caller remembered.
 */

/**
 * `64rem`, not `1024px`, because that is what Tailwind's `lg:` compiles to —
 * and a media-query `rem` resolves against the browser's *default* font size,
 * not ours. A reader who has set 20px text sees `lg:before:hidden` take effect
 * at 1280 CSS px, and a hard-coded 1024 here would hand them the desktop
 * popover while the mobile hit-slop was still on. Same unit as the class, or it
 * is not the same breakpoint.
 */
const DESKTOP_QUERY = "(min-width: 64rem)";

// `useSyncExternalStore` re-reads the snapshot on every render and `matchMedia`
// allocates a fresh MediaQueryList each call, so one lazily-created list per
// module keeps that allocation off the render path. Lazily, because touching
// `window` at import time would break the server render.
let desktopMql: MediaQueryList | null = null;

function getDesktopMql(): MediaQueryList {
  if (!desktopMql) desktopMql = window.matchMedia(DESKTOP_QUERY);
  return desktopMql;
}

function subscribeDesktop(onStoreChange: () => void): () => void {
  const mql = getDesktopMql();
  // Safari < 14 has no addEventListener on a MediaQueryList, and throwing here
  // would take the whole page down during hydration — a far worse outcome than
  // a help tip picking the wrong shell.
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

export function HelpTip({ text, label }: { text: string; label?: string }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    readDesktop,
    readDesktopOnServer
  );

  // The server snapshot says "not desktop", which would normally be a hydration
  // hazard — but nothing branches on it until `open`, and `open` starts false.
  // The first render after a click already has the real answer.

  // Everything below belongs to the desktop popover: the placement maths, the
  // resize/scroll re-placement, and the click-outside/Escape pair. Gating it on
  // `isDesktop` is not just a saving. The `mousedown` handler closes on any
  // click that is not on the button, and the sheet's own panel is exactly that
  // — leaving it armed would close the sheet the moment a reader touched the
  // words they opened it for.
  useEffect(() => {
    if (!open || !isDesktop) return;
    const WIDTH = 240;
    const MARGIN = 8;
    function place() {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      // Prefer right-aligned under the button, then clamp inside the viewport.
      let left = b.right - WIDTH;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - WIDTH - MARGIN));
      // Open downward; if that would run off the bottom, flip above the button.
      const EST_H = 120;
      const top =
        b.bottom + 6 + EST_H > window.innerHeight ? Math.max(MARGIN, b.top - 6 - EST_H) : b.bottom + 6;
      setPos({ top, left });
    }
    place();
    function onDoc(e: MouseEvent) {
      if (!btnRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isDesktop]);

  // Stable, because `Sheet` lists `onClose` in the deps of its Escape/Tab
  // effect: a fresh arrow function every render would tear that document
  // listener down and re-add it on every render the sheet is open.
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          // preventDefault too, so a "?" nested inside a card <Link> opens the
          // tooltip instead of navigating away.
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={label ?? "What's this?"}
        // No `aria-haspopup`/`aria-expanded` here even though the mobile branch
        // is a dialog: the attribute would have to say two different things at
        // the two widths, and anything that differs between the server render
        // and the client's first paint is a hydration mismatch. The sheet
        // announces itself on open (role=dialog, aria-modal, focus moved into
        // the panel), so the trigger does not have to.
        // `before:*` is the whole tap target below `lg`: 16px of glyph plus
        // 12px of slop a side (`-inset-3` is 0.75rem, not 1.5rem), so a 40px
        // region — 4px under P2's 44, and deliberately so: this is the exact
        // utility §2.2 names for this control, and every other icon-sized
        // trigger in the redesign uses the same string. Widening it here alone
        // is a Wave-6 call, not a per-file one. `active:` repeats what `hover:`
        // already says rather than inventing a second pressed look — on a laptop a
        // press is also a hover, so the two agree and desktop sees nothing new;
        // on a thumb, which has no hover, it is the only feedback there is.
        className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-600 text-[10px] font-semibold leading-none text-zinc-400 before:absolute before:-inset-3 before:content-[''] hover:border-zinc-400 hover:text-zinc-600 active:border-zinc-400 active:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 lg:before:hidden dark:hover:text-zinc-300 dark:active:text-zinc-300"
      >
        ?
      </button>
      {open && !isDesktop && (
        // React bubbles events from a portal along the *React* tree, not the
        // DOM one — and several of the 13 call sites render this component
        // inside a card `<Link>` (`streamer-home-feed.tsx:202`). Without this
        // guard, tapping the scrim or the sheet's Close button to dismiss it
        // bubbles a click into that anchor and navigates the reader away — the
        // exact failure `stopPropagation()` on the trigger exists to prevent,
        // arriving by the other door. `display:contents` so the wrapper
        // generates no box; it is only ever rendered below `lg`, while open.
        <span className="contents" onClick={(e) => e.stopPropagation()}>
          <Sheet open onClose={close} title={label ?? "What's this?"}>
            {/* Set at the same size and rhythm as `MetricHelpSheet`, because
                from the reader's side these are one surface: the same sentence
                out of `METRIC_HELP`, reached by two different triggers. */}
            <p className="py-1 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              {text}
            </p>
          </Sheet>
        </span>
      )}
      {open &&
        isDesktop &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 240 }}
            className="z-[100] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300 shadow-xl"
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
