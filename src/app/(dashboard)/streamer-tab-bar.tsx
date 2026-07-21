"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Mobile-first bottom tab bar for live streamers (Feature: app-like streamer UX).
 * Three slots — Home (own live results) · the elevated blue "+" (Screenshot /
 * Manual input) · Profile. Shown only on mobile/tablet (`lg:hidden`); desktop
 * keeps the sidebar. Tapping "+" opens a small menu ABOVE the button.
 */
export function StreamerTabBar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the menu on any navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const homeActive = pathname === "/tiktok-live";
  const profileActive = pathname.startsWith("/tiktok-live/profile");

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Streamer navigation"
      >
        <div className="relative mx-auto flex h-16 max-w-md items-center justify-around px-6">
          <Tab href="/tiktok-live" label="Home" active={homeActive} icon={<HomeIcon />} />

          {/* Center + button (elevated, blue) — opens the create sheet. */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Add live results"
            aria-expanded={menuOpen}
            className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-4 ring-white transition-transform active:scale-95 dark:ring-zinc-950"
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
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          <Tab href="/tiktok-live/profile" label="Profile" active={profileActive} icon={<UserIcon />} />
        </div>
      </nav>

      {/* Slide-up create sheet (Instagram-style). */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[60] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Add live results"
        >
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
            aria-label="Close"
          />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            <h3 className="mb-3 text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Add live results
            </h3>
            <div className="space-y-2">
              <MenuItem
                href="/tiktok-live/import?mode=screenshot"
                title="Screenshot input"
                subtitle="Read the numbers from a photo"
                icon={<CameraIcon />}
              />
              <MenuItem
                href="/tiktok-live/import?mode=manual"
                title="Manual input"
                subtitle="Type the numbers in yourself"
                icon={<KeyboardIcon />}
              />
            </div>
          </div>
        </div>
      )}
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
      className={`flex w-16 flex-col items-center gap-1 text-[11px] font-medium ${
        active ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

function MenuItem({
  href,
  title,
  subtitle,
  icon,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3.5 active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
        <span className="block text-[11px] text-zinc-500">{subtitle}</span>
      </span>
    </Link>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
function KeyboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
    </svg>
  );
}
