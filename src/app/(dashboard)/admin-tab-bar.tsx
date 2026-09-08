"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet } from "@/components/mobile/sheet";
import { SidebarNav } from "./sidebar-nav";
import { LogoutButton } from "./logout-button";

/**
 * `lg:hidden` covers the <nav>, but not the "More" `Sheet` — it portals to
 * <body>, so it is outside this component's markup and outside its breakpoint.
 * At a fixed phone width that costs nothing (the only trigger is inside the
 * hidden nav). Across a RESIZE it does: open More at 900px, widen past 1024px,
 * and the scrim, the panel and the body scroll-lock stay up over the desktop
 * sidebar layout — exactly the desktop regression P5 exists to prevent, on the
 * surface managers actually work in. So the open flag is ANDed with "we are not
 * at lg", read through `useSyncExternalStore` (a `useEffect` + `setState` pair
 * is an error under this repo's `react-hooks/set-state-in-effect`).
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
 * Bottom tab bar for admins on mobile — the mirror of `StreamerTabBar`, minus
 * the "+" (admins record nothing; they read).
 *
 * It lives beside `streamer-tab-bar.tsx` rather than in `src/components/`
 * because it is shell furniture: `DashboardShell` is its only caller and it
 * hard-codes routes, which is exactly what a reusable primitive must not do.
 *
 * Why it exists at all: today an admin changing page on a phone pays
 * open-drawer → scan-six-links → tap, and the drawer's hamburger sits in the
 * top-left corner, the hardest place on a phone for a thumb to reach. Three of
 * the six links carry almost all the traffic, so they become permanent slots
 * and the rest goes behind "More". No new destination is introduced — every
 * href here already exists, and admins already have `allowed:'all'`, so this is
 * a reshuffle of reach, not of access.
 *
 * `lg:hidden` throughout: at `lg+` the sticky sidebar column is the navigation
 * and this file renders nothing (P5).
 *
 * Both props are optional, and that is a compromise rather than a design. The
 * spec says this component takes none — true of the four tabs, which only need
 * `usePathname()` — but the "More" sheet has to render `SidebarNav` (which is
 * role-keyed) and the signed-in address, and a client component cannot read
 * either from the session. So `DashboardShell` should pass the `role` and
 * `email` it already holds. Until it does:
 *
 *  - `role` falls back to `hq_admin`, which is safe *only* because the shell
 *    mounts this for admins alone and `SidebarNav` renders `hq_admin` and
 *    `marketing_manager` identically. If either of those two facts stops being
 *    true, this fallback becomes a lie and must go.
 *  - `email` has no honest fallback, so with none the account row is simply
 *    absent. Half an address, or a guessed one, is worse than no row.
 */
export function AdminTabBar({ role, email }: { role?: string; email?: string }) {
  const pathname = usePathname();
  // Keyed on the route it was opened from, not a bare boolean: a sheet that
  // survives the route change covers the page the admin just asked for, and
  // comparing during render closes it without a setState-inside-an-effect (which
  // this repo lints as an error, and which would render the sheet one extra time
  // on the new route before hiding it).
  const [openedFrom, setOpenedFrom] = useState<string | null>(null);
  const isLg = useSyncExternalStore(subscribeLg, isLgNow, isLgOnServer);

  // Cleared on the route change rather than only compared against it. A bare
  // comparison leaves the opening route in state, so returning to it — tapping
  // the "Today" tab, or the back gesture — re-satisfies the comparison and the
  // More sheet re-opens over a page the admin asked for. Reachable today:
  // `SidebarNav`'s links carry no `onNavigate`, so navigating out of the sheet
  // through the nav is exactly the case that leaves the value behind.
  if (openedFrom !== null && openedFrom !== pathname) {
    setOpenedFrom(null);
  }

  const moreOpen = openedFrom === pathname && !isLg;
  const closeMore = () => setOpenedFrom(null);

  // Only an actual link closes it: a stray tap on the nav's padding should not
  // dismiss the sheet.
  const onNavClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("a")) closeMore();
  };

  const navRole = role ?? "hq_admin";
  const initial = (email?.[0] ?? "?").toUpperCase();

  // Most-specific-wins, the same rule `SidebarNav` uses, so "Streamers" doesn't
  // stay lit on /admin/tiktok/all while "Today" is lit too.
  const todayActive = pathname === "/admin/tiktok/all";
  const livesActive = pathname === "/tiktok-live" || pathname.startsWith("/tiktok-live/");
  const streamersActive =
    pathname === "/admin/tiktok" ||
    (pathname.startsWith("/admin/tiktok/") && !todayActive);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden"
        aria-label="Admin navigation"
      >
        <div className="mx-auto flex h-16 max-w-md items-center px-2">
          <TabLink href="/admin/tiktok/all" label="Today" active={todayActive} icon={<TodayIcon />} />
          <TabLink href="/tiktok-live" label="Lives" active={livesActive} icon={<LivesIcon />} />
          <TabLink href="/admin/tiktok" label="Streamers" active={streamersActive} icon={<StreamersIcon />} />
          <TabButton label="More" active={moreOpen} onClick={() => setOpenedFrom(pathname)} icon={<MoreIcon />} />
        </div>
      </nav>

      <Sheet open={moreOpen} onClose={closeMore} title="More">
        <div className="space-y-4 pb-2">
          {/* `SidebarNav` verbatim, not a copy of its link list. The consequence
              is worth stating plainly, because it is the whole reason: a new
              admin page is unreachable on a phone unless it is in `SidebarNav`.
              One list, one place to add to — a second hard-coded copy here
              would drift within a release, and the drift would only ever be
              visible on a phone. */}
          {/* The close handler sits on a wrapper because `SidebarNav`'s prop
              contract is `{ role }` and belongs to another owner — and because
              route-change alone cannot close the sheet when the tapped link IS
              the current route (an admin on /admin/users tapping "Users"), which
              would otherwise leave the sheet parked over the page. */}
          <div onClick={onNavClick}>
            <SidebarNav role={navRole} />
          </div>

          {/* The two deep admin pages that have no sidebar entry of their own.
              They are here rather than in `SidebarNav` because adding them
              there would also add them to the desktop sidebar, which is not
              this redesign's call to make (P5). */}
          <div className="space-y-2 px-3">
            <MoreRow href="/admin/tiktok/screenshots" label="Screenshots" onNavigate={closeMore} />
            <MoreRow href="/admin/tiktok/history" label="Sync history" onNavigate={closeMore} />
          </div>

          <div className="space-y-3 border-t border-zinc-200 px-3 pt-4 dark:border-zinc-800">
            <ThemeToggle />
            {email && (
              <div className="flex items-center gap-2 px-1">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-300/80 text-xs font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                  {initial}
                </span>
                {/* Not truncated: on a phone this is the only place that answers
                    "which account am I signed in as?", and half an address does
                    not answer it. */}
                <span className="min-w-0 break-all text-sm text-zinc-500">{email}</span>
              </div>
            )}
            <LogoutButton />
          </div>
        </div>
      </Sheet>
    </>
  );
}

const TAB_CLASS =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:active:bg-zinc-900";

function tone(active: boolean): string {
  return active ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400";
}

function TabLink({
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
    <Link href={href} aria-current={active ? "page" : undefined} className={`${TAB_CLASS} ${tone(active)}`}>
      {icon}
      {label}
    </Link>
  );
}

function TabButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={active}
      className={`${TAB_CLASS} ${tone(active)}`}
    >
      {icon}
      {label}
    </button>
  );
}

function MoreRow({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-h-14 items-center rounded-lg px-3 text-[15px] font-medium text-zinc-600 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:active:bg-zinc-800"
    >
      {label}
    </Link>
  );
}

function TodayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
function LivesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m16 12 6-3.5v7L16 12Z" />
    </svg>
  );
}
function StreamersIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" />
      <path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6M18 15.4c2 .7 3 2.2 3 4.6" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}
