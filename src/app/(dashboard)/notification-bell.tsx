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
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
