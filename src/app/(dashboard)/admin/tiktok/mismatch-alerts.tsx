"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MismatchAlert } from "@/lib/tiktok-live/queries";

const DISMISS_KEY = "lmiros:tiktok-mismatch-dismissed";

const LABELS: Record<string, string> = {
  totalViews: "Views",
  peakViewers: "Peak viewers",
  avgViewers: "Avg viewers",
  totalLikes: "Likes",
  totalComments: "Comments",
  totalShares: "Shares",
  newFollowers: "New followers",
  uniqueViewers: "Unique viewers",
  activeViewers: "Active viewers",
  avgWatchSeconds: "Avg watch (sec)",
  directMessages: "Direct messages",
  serviceBioViews: "Service bio views",
  interestedViewers: "Interested viewers",
  diamonds: "Diamonds",
};

/**
 * Admin-only popup: a live streamer saved numbers that differ from what their
 * uploaded screenshot showed. Rendered only on Admin → TikTok Live (a page
 * streamers can't reach), so streamers never see it. Each alert is dismissible
 * (remembered per-browser in localStorage).
 */
export function MismatchAlerts({ alerts }: { alerts: MismatchAlert[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setDismissed(JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"));
    } catch {
      // ignore malformed storage
    }
    setReady(true);
  }, []);

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = [...prev, id];
      try {
        localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-500)));
      } catch {
        // ignore
      }
      return next;
    });
  }

  if (!ready) return null;
  const visible = alerts.filter((a) => !dismissed.includes(a.auditId));
  if (visible.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">⚠️</span>
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-300">
          Streamer numbers don&apos;t match their screenshot ({visible.length})
        </h2>
      </div>
      <p className="mt-1 mb-3 text-xs text-amber-800/80 dark:text-amber-300/70">
        A live streamer saved figures different from what their uploaded screenshot
        read. Review before trusting these numbers.
      </p>
      <ul className="space-y-2">
        {visible.map((a) => (
          <li
            key={a.auditId}
            className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-white/70 dark:bg-zinc-950/40 px-3 py-2"
          >
            <div className="min-w-0 text-xs">
              <div className="font-medium">
                <Link
                  href={`/tiktok-live/${a.sessionId}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  @{a.handle}
                </Link>{" "}
                <span className="font-normal text-zinc-500">
                  ·{" "}
                  {a.startedAt
                    ? new Date(a.startedAt).toLocaleString("en-MY", { hour12: false })
                    : "—"}
                  {a.streamerEmail ? ` · ${a.streamerEmail}` : ""}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-zinc-600 dark:text-zinc-300">
                {a.mismatches.map((m, i) => (
                  <span key={i} className="tabular-nums">
                    <b>{LABELS[m.field] ?? m.field}</b>: screenshot {m.screenshot} → saved{" "}
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      {m.entered ?? "—"}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => dismiss(a.auditId)}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
