"use client";

import { useEffect } from "react";

/**
 * Marks the inbox read when the Notification Center is opened, then tells the
 * bell to drop its badge immediately (custom window event, no refetch wait).
 *
 * Deliberately does NOT call router.refresh() — re-rendering would strip the
 * unread highlighting while the user is still reading. Rows render as read on
 * the next navigation instead.
 */
export function MarkReadOnView() {
  useEffect(() => {
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
      .then(() => window.dispatchEvent(new Event("lmiros:notifications-read")))
      .catch(() => {
        // best-effort — the badge just clears on the next poll instead
      });
  }, []);

  return null;
}
