"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Sheet } from "@/components/mobile/sheet";
import { NotEntered } from "@/components/mobile/not-entered";

export type PickableLive = {
  sessionId: string;
  startedAt: Date | string | null;
  handle: string;
  title?: string | null;
};

function fmtWhen(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-MY", { hour12: false });
}

/**
 * A friendly "pick a live" chooser to replace the raw <select> (whose native
 * mobile picker is cramped and has no close control). One trigger button, two
 * panels: the absolutely-positioned dropdown it has always had at `lg+`, and a
 * bottom `Sheet` below it.
 *
 * The dropdown was the thing that broke on a phone, and it broke worst exactly
 * where it mattered. Its list is `max-h-[50vh]`, and `vh` on iOS is the tall,
 * keyboard-less viewport: tap the search box on a 667px screen and the keyboard
 * takes ~300px while the list still believes it is entitled to 333. What is
 * left is a two-row sliver, scrolling under the keyboard, at the precise moment
 * someone is typing to find a live among sixty. Worse, the panel is anchored to
 * the trigger with `top-full`, so on the importer - where the picker sits
 * two-thirds of the way down a long row - it opens into the bottom sixth of the
 * screen and has nowhere to grow. A sheet has none of those problems: it is
 * measured against the *visual* viewport (`dvh`), it always opens from the same
 * edge no matter where the trigger sits, and it comes with the scroll lock and
 * focus trap this component never had.
 *
 * Two things are deliberately kept out of the sheet's scrolling area:
 *
 *  - the search box is `sticky` at the top, so filtering never scrolls away the
 *    control you are filtering with. In the old dropdown the search sat above a
 *    separately-scrolling <ul>; here the whole panel is one scroll surface, and
 *    without the sticky the box would leave the screen after three rows.
 *  - the close is `Sheet`'s own 44px button (the dropdown's is 32px - fine for
 *    a cursor, half a thumb short of P2). The scrim and Escape close it too.
 *
 * What the sheet does NOT do is take focus into the search box. `Sheet` waits a
 * frame specifically so an `autoFocus` child can win, and we decline it: an
 * autofocused field summons the keyboard over the list before anyone has looked
 * at it, and the common case here is "pick the live I just finished", which is
 * the first row. Typing is the fallback for the sixty-live case, and it costs
 * one tap on a box that is pinned in place.
 *
 * Nesting is real and supported: the screenshot importer opens this picker
 * inside its own review sheet. `Sheet` keeps a module-level stack for exactly
 * that, so the inner one owns Escape and the body stays locked when it closes.
 *
 * Desktop is untouched (P5). The dropdown branch below is the same markup it
 * has always been, now `hidden lg:block` and rendered only when the viewport is
 * wide; the trigger is shared and changes only through `lg:`/`max-lg:` prefixes.
 */

/**
 * Which panel to open. Tailwind cannot answer this for us: `Sheet` portals to
 * <body>, so a `lg:hidden` wrapper around it does nothing at all - the panel is
 * no longer inside the wrapper by the time the class applies. That leaves a
 * media query in JS, and the query has to mean the *same* thing as `lg:` or the
 * two panels can both appear (or neither) in the gap between them. Hence
 * `64rem` rather than `1024px`: Tailwind v4 writes its breakpoints in `rem`, so
 * a reader who has bumped their browser's base font size moves `lg:` and this
 * query together instead of opening a 40px window where they disagree.
 */
const WIDE = "(min-width: 64rem)";

let wideMql: MediaQueryList | null = null;
function wideQuery(): MediaQueryList {
  if (!wideMql) wideMql = window.matchMedia(WIDE);
  return wideMql;
}
function subscribeWide(onChange: () => void): () => void {
  const mq = wideQuery();
  // Safari < 14 has no addEventListener on a MediaQueryList, and this call sits
  // on the hydration path: throwing here takes the whole page down, which is a
  // far worse outcome than a picker opening the wrong panel. Same guard as
  // help-tip.tsx and pane-switcher.tsx.
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }
  mq.addListener(onChange);
  return () => mq.removeListener(onChange);
}
function readWide(): boolean {
  return wideQuery().matches;
}
/**
 * The server cannot know the viewport, so it answers `false` (phone-first) —
 * the same server snapshot `help-tip.tsx`, `pane-switcher.tsx` and
 * `compact-date-filter.tsx` give, so all four breakpoint readers agree.
 *
 * Guessing wrong costs nothing here, and specifically costs desktop nothing:
 * `open` starts `false`, so neither panel is in the server HTML (the dropdown
 * is gated on `open`, and `Sheet` returns null when closed) and the hydration
 * render is byte-identical to the server's. The one thing this snapshot does
 * reach is the trigger's `aria-haspopup`, which is therefore `"dialog"` in the
 * server HTML even on a desktop page; React re-reads the real media query
 * immediately after hydration and drops the attribute. No box, no paint, no
 * layout, and nothing a reader can act on in between.
 */
function readWideOnServer(): boolean {
  return false;
}

export function LivePicker({
  lives,
  value,
  onChange,
  disabled,
  placeholder = "— pick a live —",
}: {
  lives: PickableLive[];
  value: string;
  onChange: (sessionId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const wide = useSyncExternalStore(subscribeWide, readWide, readWideOnServer);

  const selected = lives.find((l) => l.sessionId === value) ?? null;

  // Outside-click and Escape belong to the dropdown only. The sheet brings its
  // own Escape and its own scrim, and this listener would actively fight it:
  // the sheet is portalled to <body>, i.e. outside `ref`, so every tap on a row
  // inside it reads here as "clicked outside" and would close the picker before
  // the row's own click ever fires.
  useEffect(() => {
    if (!open || !wide) return;
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
  }, [open, wide]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? lives.filter((l) =>
        `${fmtWhen(l.startedAt)} @${l.handle} ${l.title ?? ""}`.toLowerCase().includes(q)
      )
    : lives;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  // Same threshold both ways: under seven lives the list is shorter than the
  // panel and a search box is one more thing to read past.
  const showSearch = lives.length > 6;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup={wide ? undefined : "dialog"}
        // `min-h-11` is the P2 floor; `lg:min-h-0` hands the row straight back
        // to `py-2.5` at desktop widths, where it renders the same 42px box it
        // renders today. The press and focus rings are `max-lg:` for the same
        // reason - on a laptop this button keeps the browser's own focus ring
        // and no press state, exactly as it does on main.
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 disabled:opacity-50 lg:min-h-0 max-lg:active:bg-zinc-100 max-lg:focus-visible:outline-2 max-lg:focus-visible:outline-offset-2 max-lg:focus-visible:outline-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 max-lg:dark:active:bg-zinc-900"
      >
        <span className={`truncate ${selected ? "" : "text-zinc-400"}`}>
          {selected
            ? `${fmtWhen(selected.startedAt)} · @${selected.handle}`
            : placeholder}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && wide && (
        <div className="absolute left-0 top-full z-40 mt-2 hidden w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl lg:block dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Pick a live
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {showSearch && (
            <div className="border-b border-zinc-200 p-2 dark:border-zinc-800">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search date or handle…"
                // Attribute-only, no box and no paint: the placeholder was this
                // field's ONLY name, and a placeholder is not an accessible name
                // once the box has text in it. Matches the sheet's twin below.
                aria-label="Search lives"
                className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
          )}

          <ul className="max-h-[50vh] overflow-y-auto overscroll-contain">
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-zinc-500">
                No matching lives.
              </li>
            )}
            {filtered.map((l) => {
              const on = l.sessionId === value;
              return (
                <li key={l.sessionId}>
                  <button
                    type="button"
                    onClick={() => pick(l.sessionId)}
                    className={`flex w-full items-start gap-2 border-b border-zinc-100 px-3 py-3 text-left last:border-b-0 dark:border-zinc-900 ${
                      on
                        ? "bg-blue-50 dark:bg-blue-950/40"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <span className="mt-0.5 w-4 shrink-0 text-blue-600 dark:text-blue-400">
                      {on ? "✓" : ""}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium tabular-nums">
                        {fmtWhen(l.startedAt)}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">
                        @{l.handle}
                        {l.title ? ` · ${l.title}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Sheet open={open && !wide} onClose={() => setOpen(false)} title="Pick a live">
        {/* `-mx-4` un-pads the sheet's scroll area so a row's tap target runs
            the full width of the panel - the row IS the target (P2), not the
            text inside it. `-mt-1` cancels the same area's top padding, so the
            sticky bar parks flush against the top edge instead of leaving a 4px
            slot for rows to show through as they pass underneath. */}
        <div className="-mx-4">
          {showSearch && (
            <div className="sticky top-0 z-10 -mt-1 border-b border-zinc-200 bg-white px-4 pb-3 pt-1 dark:border-zinc-800 dark:bg-zinc-950">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search date or handle…"
                aria-label="Search lives"
                inputMode="search"
                enterKeyHint="search"
                // `text-base` with no `sm:text-sm`: this input exists only below
                // `lg`, so the usual desktop half of that pair could never fire
                // here - all `sm:` would do is drop a tablet back to 14px and
                // hand iOS the focus-zoom the rule was written to prevent.
                className="h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
          )}

          <ul>
            {filtered.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No matching lives.
              </li>
            )}
            {filtered.map((l) => {
              const on = l.sessionId === value;
              return (
                <li
                  key={l.sessionId}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900"
                >
                  <button
                    type="button"
                    onClick={() => pick(l.sessionId)}
                    aria-current={on ? "true" : undefined}
                    className={`flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500 ${
                      on
                        ? "bg-blue-50 dark:bg-blue-950/40"
                        : "active:bg-zinc-100 dark:active:bg-zinc-900"
                    }`}
                  >
                    <span
                      className="mt-0.5 w-4 shrink-0 text-blue-600 dark:text-blue-400"
                      aria-hidden="true"
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium tabular-nums">
                        {/* A live with no start time is a broken row, not a
                            number nobody typed in - but on a phone a lone em
                            dash as the headline of a row is unreadable either
                            way, so it says what it means here. The desktop
                            branch keeps its dash. */}
                        {l.startedAt ? fmtWhen(l.startedAt) : <NotEntered />}
                      </span>
                      {/* No `truncate` (P6): the handle is how you tell two
                          lives on the same evening apart, and the title is the
                          only other clue. Both wrap; the row grows. */}
                      <span className="block text-sm text-zinc-500 dark:text-zinc-400">
                        @{l.handle}
                        {l.title ? ` · ${l.title}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Sheet>
    </div>
  );
}
