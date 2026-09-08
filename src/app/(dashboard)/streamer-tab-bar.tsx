"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Sheet } from "@/components/mobile/sheet";

/**
 * `Sheet` portals to <body>, so it sits outside this `lg:hidden` <nav> and
 * outside its breakpoint. At a fixed phone width that is harmless — the only
 * trigger is the "+" inside the hidden nav. Across a RESIZE it is not: open the
 * sheet at 900px, widen past 1024px, and the scrim, the panel and the body
 * scroll-lock stay up over the desktop layout, which is the one thing P5
 * forbids. So the open flag is ANDed with "we are not at lg", read through
 * `useSyncExternalStore` the same way `sheet.tsx` reads hydration — a
 * `useEffect` + `setState` pair is an error under this repo's
 * `react-hooks/set-state-in-effect`.
 */
const LG_QUERY = "(min-width: 1024px)";
function subscribeLg(onChange: () => void): () => void {
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function isLgNow(): boolean {
  return window.matchMedia(LG_QUERY).matches;
}
function isLgOnServer(): boolean {
  return false;
}

/**
 * Mobile-first bottom tab bar for live streamers (Feature: app-like streamer UX).
 * Three slots — Home (own live results) · the elevated blue "+" (add results) ·
 * Profile. Shown only on mobile/tablet (`lg:hidden`); desktop keeps the sidebar.
 *
 * Two things changed here and both are about the thumb, not the pixels:
 *
 *  - The tabs were `w-16` islands floating in a 64px bar, so roughly half the
 *    bar's width did nothing when tapped. They are `flex-1 min-h-14` now — the
 *    bar has no dead space left, which matters most for the one-handed grip
 *    where the thumb lands wide of centre.
 *  - The "+" menu was a hand-rolled sheet: no focus trap, no Escape, no scroll
 *    lock, so opening it on a 60-live feed and closing it lost the streamer's
 *    place. It is the shared `Sheet` now. The trade-off worth naming: the sheet
 *    portals to <body>, so it sits outside this <nav> and cannot inherit its
 *    `lg:hidden`, and "the only trigger is inside hidden markup" holds only
 *    while the viewport stays put. `isLg` above closes that gap explicitly.
 *
 * The three hrefs are frozen (contract 30). The third row is new and is the
 * point of the change: a streamer whose live the Fly.io connector never caught
 * had no route at all to the backfill form — the "+" only offered the two
 * screenshot/manual modes, both of which attach numbers to a live that already
 * exists. "Add a live that's missing" is the same `/tiktok-live/import` page
 * with no mode, which is where `AddPastLive` lives.
 */
export function StreamerTabBar() {
  const pathname = usePathname();

  // "Which route was the sheet opened from?" rather than a bare boolean, so
  // navigating closes it without an effect. The old `useEffect(() =>
  // setMenuOpen(false), [pathname])` says the same thing but is a setState
  // inside an effect, which this repo lints as an error — and it also renders
  // the sheet once more before closing it. Comparing to the current pathname
  // during render just never opens it on the new route.
  const [openedFrom, setOpenedFrom] = useState<string | null>(null);
  const isLg = useSyncExternalStore(subscribeLg, isLgNow, isLgOnServer);

  // Cleared on the route change, not merely compared against it. Comparing
  // alone leaves the old route sitting in state, so coming BACK to it — a tab
  // tap, the browser's back gesture — makes `openedFrom === pathname` true
  // again and the sheet springs open with nobody having asked for it.
  if (openedFrom !== null && openedFrom !== pathname) {
    setOpenedFrom(null);
  }

  const menuOpen = openedFrom === pathname && !isLg;
  const closeMenu = () => setOpenedFrom(null);

  const homeActive = pathname === "/tiktok-live";
  const profileActive = pathname.startsWith("/tiktok-live/profile");

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Streamer navigation"
      >
        <div className="relative mx-auto flex h-16 max-w-md items-center px-2">
          <Tab href="/tiktok-live" label="Home" active={homeActive} icon={<HomeIcon />} />

          {/* Center + button (elevated, blue) — opens the create sheet. */}
          <button
            type="button"
            onClick={() => setOpenedFrom((v) => (v === pathname ? null : pathname))}
            aria-label="Add live results"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="-mt-8 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-4 ring-white transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:ring-zinc-950"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className={`transition-transform duration-200 ${menuOpen ? "rotate-45" : ""}`}
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          <Tab href="/tiktok-live/profile" label="Profile" active={profileActive} icon={<UserIcon />} />
        </div>
      </nav>

      <Sheet open={menuOpen} onClose={closeMenu} title="Add live results">
        <div className="space-y-2 pb-2">
          <MenuItem
            href="/tiktok-live/import?mode=screenshot"
            title="Screenshot input"
            icon={<CameraIcon />}
            onNavigate={closeMenu}
          />
          <MenuItem
            href="/tiktok-live/import?mode=manual"
            title="Manual input"
            icon={<KeyboardIcon />}
            onNavigate={closeMenu}
          />
          {/* Fix F1. Ordered last because it is the rarer case, but it has to be
              here: the two rows above both assume the live is already in the
              list, and when the connector missed it entirely there is nothing
              to attach numbers to. */}
          <MenuItem
            href="/tiktok-live/import"
            title="Add a live that's missing"
            icon={<PlusListIcon />}
            onNavigate={closeMenu}
          />
        </div>
      </Sheet>
    </>
  );
}

function Tab({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:active:bg-zinc-900 ${
        active ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

/**
 * `onNavigate` exists because all three rows live under `/tiktok-live/import`,
 * and the pathname-keyed open state above cannot see a change of query string.
 * Without it, tapping "Manual input" while already on the screenshot mode would
 * navigate correctly and leave the sheet sitting over the result.
 */
function MenuItem({
  href,
  title,
  icon,
  onNavigate,
}: {
  href: string;
  title: string;
  icon: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex h-14 items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium text-zinc-900 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:active:bg-zinc-800"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
        {icon}
      </span>
      <span className="min-w-0">{title}</span>
    </Link>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
function KeyboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
    </svg>
  );
}
function PlusListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h10M4 12h7M4 17h7" />
      <path d="M17 13v7M13.5 16.5h7" />
    </svg>
  );
}
