"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const POLL_MS = 60_000;

/**
 * Notification Center bell + unread badge for the app shell.
 *
 * Polls the count only (cheap), refetches when the tab becomes visible again —
 * so coming back from a session form updates the badge — and listens for
 * `lmiros:notifications-read` so opening the list clears it instantly rather
 * than after the next poll. Fire-and-forget: the API returns an empty payload
 * instead of erroring when there's no session.
 *
 * The bell is 44px rather than 36px because it sits in the top-right corner of
 * the mobile header — the far end of a right-handed thumb's arc, and the one
 * place in the app where an 8px miss is most likely. It renders below `lg`
 * only (the header holding it is `lg:hidden`), so the extra 8px costs the
 * desktop layout nothing.
 *
 * Three things here are deliberately not tunable: the 60s `countOnly=1` poll,
 * the `visibilitychange` refetch and the `lmiros:notifications-read` listener.
 * Drop any one of them and the badge sits stale for up to a minute after the
 * streamer has already read the list, which reads as the app not knowing what
 * they just did.
 */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let aborted = false;

    async function poll() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/notifications?countOnly=1", {
          cache: "no-store",
        });
        const json = (await res.json()) as { unread?: number };
        if (!aborted) setUnread(Number(json.unread) || 0);
      } catch {
        // ignore — keep the last known count
      }
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    const onRead = () => setUnread(0);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("lmiros:notifications-read", onRead);

    return () => {
      aborted = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("lmiros:notifications-read", onRead);
    };
  }, []);

  return (
    <Link
      href="/tiktok-live/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative flex h-11 w-11 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-200 active:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-800"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold leading-none text-white tabular-nums">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
