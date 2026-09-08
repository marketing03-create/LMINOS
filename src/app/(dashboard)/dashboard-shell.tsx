"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarNav } from "./sidebar-nav";
import { BackBar } from "./back-bar";
import { LogoutButton } from "./logout-button";
import { StreamerTabBar } from "./streamer-tab-bar";
import { AdminTabBar } from "./admin-tab-bar";
import { NotificationBell } from "./notification-bell";

/**
 * Responsive app shell. Desktop (lg+): the sidebar is a permanent left column,
 * exactly as before. Phone/tablet: every role now navigates from a bottom tab
 * bar — streamers from `StreamerTabBar`, admins from `AdminTabBar` — and the top
 * bar carries nothing but the logo and (for streamers) the notification bell.
 *
 * The off-canvas drawer and its hamburger are gone below `lg`. That was the one
 * real behaviour change here, and it is worth spelling out: the top-left corner
 * is the hardest place on a phone for a thumb to reach, and every admin page
 * change cost open-drawer → scan-six-links → tap. `AdminTabBar`'s More sheet
 * renders the same `SidebarNav`, so no destination was lost — a page that is in
 * the nav is still reachable, and a page that is not never was.
 *
 * The sidebar therefore became `hidden lg:flex` rather than a translated drawer.
 * Every class that had any effect at 1024px is still on the element (`lg:sticky
 * lg:left-0 lg:top-0 lg:z-30 lg:flex` replacing what `fixed left-0 top-0 z-50
 * flex` used to supply below that width), so the desktop column renders exactly
 * as it does today; what dropped out is the transform and transition that only
 * ever moved the drawer on a phone. Bonus: the nav links are no longer sitting
 * off-screen in the tab order for a streamer who could never open the drawer.
 */
export function DashboardShell({
  role,
  email,
  homeHref,
  children,
}: {
  role: string;
  email: string;
  homeHref: string;
  children: React.ReactNode;
}) {
  const initial = (email[0] ?? "?").toUpperCase();
  const isStreamer = role === "live_streamer";
  // Same inline test layout.tsx uses for LiveNotifier, kept inline rather than
  // importing isAdminRole so this client file pulls in no auth module at all.
  const isAdmin = role === "hq_admin" || role === "marketing_manager";
  // Roles with neither bar (team_lead, viewer, …) only ever see /no-access.
  const hasTabBar = isStreamer || isAdmin;

  // `--lmiros-bottom-bar` in globals.css keys off `body[data-lmiros-tabbar="1"]`,
  // and the <body> tag belongs to the root layout — a server component shared
  // with /login, which must not pad for a bar it never renders. So the shell
  // stamps the attribute from an effect and clears it on unmount. The cost is
  // that the var reads 0px for the first frame after hydration; that is fine,
  // because everything reading it is a sticky action bar that is itself a client
  // component mounting in the same pass, and the failure mode is one frame of a
  // button sitting 64px lower, never a button hidden under the tab bar.
  useEffect(() => {
    if (!hasTabBar) return;
    document.body.dataset.lmirosTabbar = "1";
    return () => {
      delete document.body.dataset.lmirosTabbar;
    };
  }, [hasTabBar]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 lg:flex">
      {/* Mobile top bar (hidden on desktop). The padding sits on the header and
          the 48px row sits inside it: with border-box sizing, putting the notch
          inset on an `h-12` element would eat the logo instead of moving it. */}
      <header className="lg:hidden sticky top-0 z-40 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-100/85 dark:bg-zinc-900/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-12 items-center gap-3 px-4">
          <Link
            href={homeHref}
            className="flex min-h-11 items-center gap-2 rounded-lg px-1 active:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:active:bg-zinc-800/70"
          >
            <Image
              src="/logo.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-lg"
              priority
            />
            <span className="font-semibold tracking-tight">LMIROS</span>
          </Link>
          {/* Notification Center — streamers only for now (nothing writes admin
              rows yet, so it would sit permanently at 0). */}
          {isStreamer && (
            <div className="ml-auto">
              <NotificationBell />
            </div>
          )}
        </div>
      </header>

      {/* Sidebar: desktop column only. Below lg it is not rendered at all. */}
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-zinc-200/80 bg-zinc-100/95 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/95 lg:sticky lg:left-0 lg:top-0 lg:z-30 lg:flex">
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <Link href={homeHref} className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-lg shadow-sm"
              priority
            />
            <span>
              <span className="block text-[15px] font-semibold leading-none tracking-tight">
                LMIROS
              </span>
              <span className="mt-1 block text-[10px] uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
                Revenue Foundation
              </span>
            </span>
          </Link>
        </div>

        <SidebarNav role={role} />

        <div className="space-y-3 border-t border-zinc-200/80 px-3 py-3 dark:border-zinc-800/80">
          <ThemeToggle />
          <div className="flex items-center gap-2 px-1">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-300/80 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
              {initial}
            </span>
            <span className="truncate text-xs text-zinc-500">{email}</span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* The bottom padding is unconditional below lg now. It used to be
          streamer-only, which is why an admin's last table row sat under the
          bar the moment they got one. */}
      <main className="min-w-0 flex-1 overflow-x-clip pb-28 lg:pb-0">
        <BackBar homeHref={homeHref} />
        {children}
      </main>

      {/* App-like bottom nav — one per role, both lg:hidden internally. */}
      {isStreamer && <StreamerTabBar />}
      {isAdmin && <AdminTabBar role={role} email={email} />}
    </div>
  );
}
