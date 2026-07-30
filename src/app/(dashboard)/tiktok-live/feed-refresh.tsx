"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the TikTok Live feed showing what's ACTUALLY saved, on every device.
 *
 * The bug this fixes: a streamer keys in her results, the save succeeds, but her
 * feed still shows "no record". The data is there — she's just looking at a
 * cached copy of the page:
 *   • After saving, the app navigates back here with a client-side push, which
 *     Next.js serves from its in-memory Router Cache (the feed as it was when she
 *     first opened the app — without the new live).
 *   • On iPad / iPhone Safari, returning to this tab or hitting Back restores the
 *     page from the back/forward cache without re-rendering at all.
 *
 * So we refetch the server data (no full reload, no scroll jump — router.refresh
 * merges the fresh data in place) whenever the feed is shown: on arrival, when
 * the tab becomes visible again, and when Safari restores it from bfcache.
 * Renders nothing.
 */
export function FeedRefresh() {
  const router = useRouter();
  const lastAt = useRef(0);

  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      if (now - lastAt.current < 800) return; // dedupe rapid triggers
      lastAt.current = now;
      router.refresh();
    };

    // Landed here (often from saving results) — the pushed page may be cached.
    refresh();

    // iOS Safari back/forward cache restore.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refresh();
    };
    // Returning to the tab / app.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
