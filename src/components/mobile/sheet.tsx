"use client";

import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * The one bottom-sheet in the app. Every popover-shaped thing below `lg` is
 * meant to become this; at `lg+` callers keep whatever popover they already
 * have, so desktop never changes.
 *
 * Why a primitive instead of another hand-rolled dropdown: the three we already
 * had each broke on a phone in a different way, and each break was invisible on
 * a laptop.
 *
 *  - `CompactDateFilter`'s 260px absolute popover is clipped on the right at
 *    375px, because `main` carries `overflow-x-clip`. A portal to <body> plus
 *    `position: fixed` is the only reliable cure for "an ancestor clips me".
 *  - `LivePicker`'s list is `max-h-[50vh]`, and `vh` on iOS is the tall
 *    (keyboard-less) viewport. Focus its search box and the keyboard eats the
 *    bottom half of a box that still thinks it is 50% of the screen, so the
 *    list you are searching collapses to a sliver at the exact moment you use
 *    it. `dvh` is the fix — and the `@supports` block below is what keeps that
 *    fix from becoming the same bug on iOS < 15.4, where an unknown `dvh`
 *    declaration is simply dropped and the panel would fall back to `auto`
 *    height and run off the screen. Hence: `vh` first, `dvh` only where the
 *    browser says it understands it.
 *  - `StreamerTabBar`'s "+" sheet is a fourth implementation with no focus
 *    trap, no Escape and no scroll lock. It gets deleted into this one.
 *
 * Scroll lock, focus trap and focus restore are not polish here. A sheet that
 * lets the page behind it scroll loses the streamer's place in a 60-live feed,
 * and a sheet that drops focus on close strands a keyboard or screen-reader
 * user at the top of the document after every single filter change.
 *
 * The one thing this file refuses to assume is that it is the only sheet on
 * screen — see the stack below. Sheets nest for real (`LeadsQuickSheet` carries
 * a `HelpChip`, which opens a second one on top of it), and every per-instance
 * shortcut breaks in that case.
 */

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Pinned below the scroll area, above the safe-area pad. */
  footer?: React.ReactNode;
  /** 100dvh review sheets (the screenshot importer). */
  fullHeight?: boolean;
  /** Point the dialog at a heading the caller already renders. */
  labelledById?: string;
};

/**
 * Heights live in a stylesheet rather than in `style={{…}}` because the `dvh`
 * fallback needs the cascade: an inline style cannot hold two values for one
 * property, and an inline `vh` would beat a `dvh` utility class even on
 * browsers that support `dvh`. Written in the positive (`@supports (…)`) rather
 * than `@supports not (…)`, so the safe value is what a browser gets when it
 * fails to parse anything at all.
 */
const SHEET_CSS = `
.lm-sheet-panel { max-height: 85vh; }
@supports (max-height: 85dvh) { .lm-sheet-panel { max-height: 85dvh; } }
.lm-sheet-panel-full { height: 100vh; max-height: 100vh; }
@supports (height: 100dvh) { .lm-sheet-panel-full { height: 100dvh; max-height: 100dvh; } }
@keyframes lm-sheet-in { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes lm-sheet-scrim-in { from { opacity: 0; } to { opacity: 1; } }
.lm-sheet-panel { animation: lm-sheet-in 180ms cubic-bezier(0.32, 0.72, 0, 1); }
.lm-sheet-scrim { animation: lm-sheet-scrim-in 180ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .lm-sheet-panel, .lm-sheet-scrim { animation: none; }
}
`;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * One body lock and one "who is on top" answer for the whole app, kept at module
 * scope because no instance can see the others. When two sheets are open, the
 * naive per-instance version fails three ways at once:
 *
 *  - whichever sheet unmounts first hands the page's scroll back while the
 *    other is still up (each one restored the overflow *it* happened to read,
 *    and the second one read "hidden");
 *  - one Escape closes both, because `stopPropagation` cannot stop a sibling
 *    listener on the same node in the same phase — only a stack can say which
 *    dialog the key belongs to;
 *  - both focus traps fight over every Tab, because the inner sheet portals to
 *    <body> and therefore sits *outside* the outer panel that is trying to
 *    contain it, which reads to the outer trap as "focus escaped, pull it back".
 *
 * A count would fix the first. Only a stack fixes all three.
 */
const sheetStack: object[] = [];
let scrollBefore: {
  htmlOverflowY: string;
  bodyOverflowY: string;
  paddingRight: string;
} | null = null;

/**
 * The lock has to touch <html>, not just <body>. `globals.css` puts
 * `overflow-x: clip` on both, and the moment the root element's overflow stops
 * being `visible` the browser stops taking the viewport's scrolling behaviour
 * from <body> — so the textbook `body { overflow: hidden }` lock is inert in
 * this app and the page would happily scroll behind an open sheet. Y axis only,
 * on both elements: the `overflow` shorthand would overwrite that deliberate
 * `clip` (which is there so sticky headers keep working) with `hidden`.
 */
function lockBody(token: object): void {
  sheetStack.push(token);
  if (sheetStack.length > 1) return;
  const html = document.documentElement;
  const body = document.body;
  // Measure before anything is hidden — afterwards the scrollbar is gone and
  // the gap reads as 0.
  const gap = window.innerWidth - html.clientWidth;
  scrollBefore = {
    htmlOverflowY: html.style.overflowY,
    bodyOverflowY: body.style.overflowY,
    paddingRight: body.style.paddingRight,
  };
  html.style.overflowY = "hidden";
  body.style.overflowY = "hidden";
  // Taking the scrollbar away reflows the page underneath by its width. A phone
  // has overlay scrollbars and loses nothing; a desktop browser jumps ~15px,
  // and "desktop does not move" is the one promise this redesign cannot break.
  if (gap > 0) body.style.paddingRight = `${gap}px`;
}

function unlockBody(token: object): void {
  const i = sheetStack.lastIndexOf(token);
  if (i !== -1) sheetStack.splice(i, 1);
  if (sheetStack.length > 0 || !scrollBefore) return;
  document.documentElement.style.overflowY = scrollBefore.htmlOverflowY;
  document.body.style.overflowY = scrollBefore.bodyOverflowY;
  document.body.style.paddingRight = scrollBefore.paddingRight;
  scrollBefore = null;
}

function isTopSheet(token: object): boolean {
  return sheetStack[sheetStack.length - 1] === token;
}

/**
 * "Have we hydrated yet?" — the gate on the portal. It cannot be
 * `typeof document`, because `open` may already be true on the very first
 * client render and the server markup would not match. It also cannot be a
 * `useState` + `useEffect` pair: `react-hooks/set-state-in-effect` is an
 * *error* in this repo's config, so that shape fails `npm run lint`.
 * `useSyncExternalStore` says the same thing and is the pattern
 * `pane-switcher.tsx` already uses. Nothing ever changes, so the store never
 * notifies.
 */
function subscribeNever(): () => void {
  return () => {};
}
function readMounted(): boolean {
  return true;
}
function readMountedOnServer(): boolean {
  return false;
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  fullHeight,
  labelledById,
}: SheetProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreToRef = useRef<HTMLElement | null>(null);
  // Identity only — its address is this instance's seat in `sheetStack`.
  const tokenRef = useRef<object>({});
  const titleId = useId();

  const mounted = useSyncExternalStore(
    subscribeNever,
    readMounted,
    readMountedOnServer
  );

  const focusables = useCallback(() => {
    const root = panelRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
  }, []);

  // Remember the trigger, take focus, lock the body, and put everything back on
  // close — one effect, so the teardown can never run out of order.
  useEffect(() => {
    if (!open) return;

    const token = tokenRef.current;
    const active = document.activeElement;
    restoreToRef.current = active instanceof HTMLElement ? active : null;

    lockBody(token);

    // Wait a frame so a child with autoFocus (the LivePicker search box) wins.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (panel && !panel.contains(document.activeElement)) panel.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      unlockBody(token);
      const back = restoreToRef.current;
      // `preventScroll`: the trigger is usually still where the reader left it,
      // and re-scrolling to it throws away the position the sheet preserved.
      if (back && document.contains(back)) back.focus({ preventScroll: true });
      restoreToRef.current = null;
    };
  }, [open]);

  // Escape closes; Tab cycles inside the panel.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // A sheet that is not on top is furniture: the sheet above it owns both
      // Escape and Tab until it closes.
      if (!isTopSheet(tokenRef.current)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = focusables();
      if (items.length === 0) {
        // Nothing to tab to — keep focus on the panel rather than letting it
        // escape to the page underneath.
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      // Focus can sit outside the panel without the user ever tabbing there —
      // tapping the scrim, or coming back from the browser chrome, parks it on
      // <body>. Both directions have to pull it back in, or the next Tab walks
      // the page underneath the sheet, which is exactly the trap failure the
      // deleted StreamerTabBar sheet had.
      const outside = !panel.contains(current);
      if (e.shiftKey && (current === first || current === panel || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose, focusables]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <style>{SHEET_CSS}</style>

      <div
        className="lm-sheet-scrim absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById ?? titleId}
        tabIndex={-1}
        className={`lm-sheet-panel relative mx-auto flex w-full flex-col rounded-t-2xl border-t border-zinc-200 bg-white outline-none sm:max-w-lg dark:border-zinc-800 dark:bg-zinc-950 ${
          fullHeight ? "lm-sheet-panel-full" : ""
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        <div className="shrink-0 px-4 pt-3">
          <div
            className="mx-auto mb-3 h-1 w-9 rounded-full bg-zinc-300 dark:bg-zinc-700"
            aria-hidden="true"
          />
          <div className="flex min-h-11 items-center gap-2">
            <h2
              id={titleId}
              className="min-w-0 flex-1 text-[17px] font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:active:bg-zinc-800"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-1">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-zinc-200 px-4 pt-3 dark:border-zinc-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
