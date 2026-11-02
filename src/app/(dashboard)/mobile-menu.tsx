"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ThemeToggle } from "@/components/theme-toggle";
import { activeHref, navFor } from "@/lib/nav";
import { LogoutButton } from "./logout-button";

/**
 * The phone's top-right menu: every page the signed-in role may open
 * (lib/nav.ts — tested against the access policy), then the account: email,
 * theme and log out. Every role gets it, including roles whose only page is
 * "No access", so nobody is ever stuck on a screen with no way to sign out.
 *
 * A drop-down from the button rather than a bottom sheet, so the list opens
 * where the thumb just pressed. Lg+ never renders it — the sidebar is the menu.
 */
export function MobileMenu({ role, email }: { role: string; email: string }) {
  const pathname = usePathname();
  // Keyed on the route it was opened from (same pattern as AdminTabBar): a
  // route change closes it during render, with no setState inside an effect.
  const [openedFrom, setOpenedFrom] = useState<string | null>(null);
  if (openedFrom !== null && openedFrom !== pathname) setOpenedFrom(null);
  const open = openedFrom === pathname;
  const close = () => setOpenedFrom(null);

  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const groups = navFor(role);
  const current = activeHref(groups, pathname);

  // Escape closes; focus moves into the panel on open and back to the button
  // on close; the page behind doesn't scroll while it's open.
  useEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenedFrom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      button?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenedFrom(open ? null : pathname)}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-700 active:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-200 dark:active:bg-zinc-800/70"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {/* Portaled to <body>: the sticky top bar is its own stacking context
          (z-40), so anything inside it sits under the bottom tab bars (z-50)
          however high its own z-index — they covered the menu's last rows,
          Log out among them. At body level z-[60] clears the tab bars and
          stays under sheets (z-70). `open` is only ever true after a click,
          so `document` always exists here. */}
      {open &&
        createPortal(
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={close}
            className="absolute inset-0 h-full w-full cursor-default bg-black/30"
          />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute right-3 top-[calc(env(safe-area-inset-top)+3.25rem)] max-h-[calc(100dvh-env(safe-area-inset-top)-4.5rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <nav aria-label="Pages">
              {groups.map((g, i) => (
                <div key={g.label ?? i} className={i > 0 ? "mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800" : ""}>
                  {g.label && (
                    <div className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
                      {g.label}
                    </div>
                  )}
                  <ul>
                    {g.items.map((it) => {
                      const active = it.href === current;
                      return (
                        <li key={it.href}>
                          <Link
                            href={it.href}
                            onClick={close}
                            aria-current={active ? "page" : undefined}
                            className={`flex min-h-11 items-center rounded-lg px-3 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                              active
                                ? "bg-blue-600 text-white"
                                : "text-zinc-700 active:bg-zinc-100 dark:text-zinc-200 dark:active:bg-zinc-800"
                            }`}
                          >
                            {it.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="mt-2 space-y-3 border-t border-zinc-100 px-1 pb-1 pt-3 dark:border-zinc-800">
              <div className="break-all px-2 text-sm text-zinc-500 dark:text-zinc-400">{email}</div>
              <ThemeToggle />
              <LogoutButton />
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
