"use client";

import { useEffect } from "react";

/**
 * When the page is opened at `#session-<id>` (the streamer just saved a live on
 * the upload page and we redirected here), scroll that row into view and flash
 * it so they immediately see the updated numbers. Retries briefly in case the
 * table streams in a tick after mount.
 */
export function SessionHighlighter() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#session-")) return;
    const id = hash.slice(1);
    let tries = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function attempt() {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("session-flash");
        timers.push(setTimeout(() => el.classList.remove("session-flash"), 2600));
        return;
      }
      if (tries++ < 10) timers.push(setTimeout(attempt, 200));
    }
    attempt();

    return () => timers.forEach(clearTimeout);
  }, []);

  return null;
}
