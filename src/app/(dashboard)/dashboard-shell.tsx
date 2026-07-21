"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarNav } from "./sidebar-nav";
import { BackBar } from "./back-bar";
import { LogoutButton } from "./logout-button";
import { StreamerTabBar } from "./streamer-tab-bar";
import { NotificationBell } from "./notification-bell";

/**
 * Responsive app shell. Desktop (lg+): the sidebar is a permanent left column,
 * exactly as before. Mobile/tablet: the sidebar becomes an off-canvas drawer
 * behind a top bar with a hamburger — so streamers on phones get the full width
 * for the upload flow and can still reach every page. The drawer auto-closes on
 * navigation.
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
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const initial = (email[0] ?? "?").toUpperCase();
  // Live streamers get an app-like bottom tab bar on mobile instead of the
  // hamburger drawer, so the phone experience is Home / + / Profile.
  const isStreamer = role === "live_streamer";

  useEffect(() => {
    setOpen(false); // close the drawer whenever the route changes
  }, [pathname]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 lg:flex">
      {/* Mobile top bar (hidden on desktop). Streamers use the bottom tab bar
          instead, so they get a cleaner app-like top with just the logo. */}
      <header className="lg:hidden sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-100/85 dark:bg-zinc-900/80 px-4 backdrop-blur">
        {!isStreamer && (
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        )}
        <Link href={homeHref} className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
            L
          </span>
          <span className="font-semibold tracking-tight">LMIROS</span>
        </Link>
        {/* Notification Center — streamers only for now (nothing writes admin
            rows yet, so it would sit permanently at 0). */}
        {isStreamer && (
          <div className="ml-auto">
            <NotificationBell />
          </div>
        )}
      </header>

      {/* Backdrop when the drawer is open (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar: off-canvas drawer on mobile, static column on desktop */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-zinc-200/80 bg-zinc-100/95 backdrop-blur-xl transition-transform duration-200 dark:border-zinc-800/80 dark:bg-zinc-900/95 lg:sticky lg:z-30 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <Link href={homeHref} className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-sm">
              L
            </span>
            <span>
              <span className="block text-[15px] font-semibold leading-none tracking-tight">
                LMIROS
              </span>
              <span className="mt-1 block text-[10px] uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
                Revenue Foundation
              </span>
            </span>
          </Link>
          {/* Close (mobile only) */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 lg:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
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

      <main
        className={`min-w-0 flex-1 overflow-x-clip ${
          isStreamer ? "pb-24 lg:pb-0" : ""
        }`}
      >
        <BackBar homeHref={homeHref} />
        {children}
      </main>

      {/* App-like bottom nav — streamers on mobile only. */}
      {isStreamer && <StreamerTabBar />}
    </div>
  );
}
