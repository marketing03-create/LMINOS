"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  handle: string | null;
  href: string | null;
  createdAt: string;
};

const SEEN_KEY = "lmiros_live_alert_seen";
const POLL_MS = 30_000;
const FRESH_MS = 6 * 60 * 1000; // only pop notifications newer than this
const PRUNE_MS = 30 * 60 * 1000;
const TOAST_MS = 12_000;

function loadSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}
function saveSeen(m: Record<string, number>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(m));
  } catch {
    // ignore (private mode / quota)
  }
}

/**
 * Admin-only pop-out — bottom-centre on a phone, top-centre on a laptop, for the
 * reason spelled out at the container below. Polls the app_notifications feed and toasts any
 * fresh, unseen event (today: a streamer going live). Dedupes via a localStorage
 * seen-set so a page refresh never re-pops, and only surfaces events from the
 * last few minutes so opening the app doesn't flood old ones.
 */
export function LiveNotifier() {
  const [toasts, setToasts] = useState<Notif[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const tm = timers.current[id];
    if (tm) {
      clearTimeout(tm);
      delete timers.current[id];
    }
  }, []);

  const poll = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    let list: Notif[] = [];
    try {
      const res = await fetch("/api/live-alerts", { cache: "no-store" });
      const data = (await res.json()) as { notifications?: Notif[] };
      list = data?.notifications ?? [];
    } catch {
      return;
    }
    if (!list.length) return;

    const seen = loadSeen();
    const now = Date.now();
    const toShow: Notif[] = [];
    for (const n of list) {
      if (seen[n.id]) continue;
      seen[n.id] = now; // mark seen even if too old to pop (silently)
      if (now - new Date(n.createdAt).getTime() < FRESH_MS) toShow.push(n);
    }
    for (const k of Object.keys(seen)) {
      if (now - seen[k] > PRUNE_MS) delete seen[k];
    }
    saveSeen(seen);

    if (!toShow.length) return;
    setToasts((prev) => {
      const have = new Set(prev.map((t) => t.id));
      return [...prev, ...toShow.filter((t) => !have.has(t.id))];
    });
    for (const n of toShow) {
      if (!timers.current[n.id]) {
        timers.current[n.id] = setTimeout(() => dismiss(n.id), TOAST_MS);
      }
    }
  }, [dismiss]);

  useEffect(() => {
    void poll();
    const iv = setInterval(() => void poll(), POLL_MS);
    const onVis = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    const snapshot = timers.current;
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      for (const k of Object.keys(snapshot)) clearTimeout(snapshot[k]);
    };
  }, [poll]);

  if (!toasts.length) return null;

  return (
    // Bottom on a phone, unchanged at the top on a laptop. `top-4` put the toast
    // directly over the sticky top bar — the one strip that is always on screen —
    // so an alert about a streamer going live hid the logo and the notification
    // bell for its full 12 seconds. Bottom is also where the thumb already is.
    // `--lmiros-bottom-bar` keeps it clear of whichever tab bar is mounted and
    // resolves to 0 when there is none, so nothing hard-codes 4rem a second time.
    <div
      role="status"
      aria-live="polite"
      className="fixed top-auto bottom-[calc(var(--lmiros-bottom-bar)+1rem)] lg:bottom-auto lg:top-4 left-1/2 -translate-x-1/2 z-[100] flex w-[calc(100%-2rem)] max-w-md flex-col items-center gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex w-full items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] lg:text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t.title}
            </div>
            {/* Clipping stays a desktop-only habit. The body here is the handle
                and the time — the two things that decide whether this alert is
                worth tapping — and on a 375px card `truncate` ate most of it. */}
            {t.body && <div className="text-sm lg:truncate lg:text-xs text-zinc-500">{t.body}</div>}
            {t.href && (
              <Link
                href={t.href}
                onClick={() => dismiss(t.id)}
                className="mt-1 inline-flex min-h-11 items-center lg:inline-block lg:min-h-0 text-sm lg:text-xs font-medium text-blue-600 hover:underline active:text-blue-800 dark:text-blue-400 dark:active:text-blue-300"
              >
                View →
              </Link>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            // 44px of box below lg. A 14px ✕ eight pixels from a "View →" link is
            // a coin-flip between dismissing the alert and following it, and the
            // toast auto-clears in 12s anyway — so the cheap tap has to be the
            // right one. At lg it collapses back to the original inline glyph.
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base leading-none text-zinc-400 hover:text-zinc-700 active:bg-zinc-100 dark:hover:text-zinc-200 dark:active:bg-zinc-800 lg:inline-block lg:h-auto lg:w-auto lg:rounded-none lg:text-sm"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
