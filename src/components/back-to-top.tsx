"use client";

import { useEffect, useState } from "react";

/** How far down the page before the button shows. */
const SHOW_AFTER_PX = 600;

/**
 * A small round "^" button, bottom-right, that scrolls back to the top. Only
 * shows once the page has been scrolled a fair way, so it never sits over a
 * short page. Below `lg` it rides above whichever tab bar is mounted
 * (`--lmiros-bottom-bar`, see globals.css).
 */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      }}
      aria-label="Back to top"
      className="fixed bottom-[calc(var(--lmiros-bottom-bar)+env(safe-area-inset-bottom)+1rem)] right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-700 shadow-lg backdrop-blur active:bg-zinc-100 lg:bottom-6 lg:right-6 lg:hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200 dark:active:bg-zinc-800 lg:dark:hover:bg-zinc-800"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5" aria-hidden="true">
        <path d="m5 12.5 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
