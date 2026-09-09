"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MismatchAlert } from "@/lib/tiktok-live/queries";
import { NotEntered } from "@/components/mobile/not-entered";
import { RecordCard, RecordList } from "@/components/mobile/record-card";

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

// Words, not a dash: below `lg` a bare em dash is indistinguishable from "zero"
// or "loading", and this string sits on an alert about a number being wrong.
// The desktop panel below keeps its dash, where the column header explains it.
function fmtWhen(d: Date | null): string {
  return d ? new Date(d).toLocaleString("en-MY", { hour12: false }) : "no start time";
}

/**
 * Admin-only popup: a live streamer saved numbers that differ from what their
 * uploaded screenshot showed. Rendered only on Admin → TikTok Live (a page
 * streamers can't reach), so streamers never see it. Each alert is dismissible
 * (remembered per-browser in localStorage).
 *
 * This is the only anti-fraud surface in the product, which is exactly why it
 * gets a phone layout of its own instead of a shrink of the desktop one. Below
 * `lg` the whole thing was a 12px paragraph, a wrapping run of 12px field
 * comparisons, and a 24px "Dismiss" sitting inside the same 343px row — so the
 * one control that permanently hides an alert was the easiest thing on the card
 * to hit by accident, and the numbers it hides were the hardest to read.
 *
 * The card list below carries the same alerts, in the same order, from the same
 * `recentScreenshotMismatches()` rows: nothing is filtered, nothing is summed,
 * and `dismiss()` writes the same auditIds to the same key. The desktop panel
 * underneath is the original markup, untouched behind `hidden lg:block`.
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
    <>
      {/* ---- Phone ------------------------------------------------------- */}
      <section className="mb-6 lg:hidden">
        <h2 className="mb-3 text-[17px] font-semibold text-amber-700 dark:text-amber-400">
          <span className="sr-only">Needs attention: </span>
          Numbers that differ from a screenshot ({visible.length})
        </h2>
        <RecordList>
          {visible.map((a) => (
            <RecordCard
              key={a.auditId}
              tone="warn"
              href={`/tiktok-live/${a.sessionId}`}
              title={`${a.streamerEmail ?? `@${a.handle}`} saved ${
                a.mismatches.length
              } ${a.mismatches.length === 1 ? "number" : "numbers"} that differ from their screenshot`}
              meta={`@${a.handle} · ${fmtWhen(a.startedAt)}`}
              badges={a.mismatches.map((m, i) => (
                // One chip per field rather than one wrapping sentence: an
                // admin is comparing pairs, and pairs that wrap into each other
                // are how you end up reading someone else's Views as their
                // Likes. `tabular-nums` keeps the two sides of the arrow the
                // same width apart on every chip.
                <span
                  key={i}
                  className="inline-flex flex-wrap items-baseline gap-x-1 rounded-lg bg-amber-50 px-2.5 py-1 text-sm tabular-nums text-zinc-700 dark:bg-amber-950/40 dark:text-zinc-200"
                >
                  <b className="font-medium">{LABELS[m.field] ?? m.field}</b>
                  {/* Both sides get a spoken label. The arrow is the only thing
                      telling a sighted reader which number is which, and it is
                      aria-hidden — so without these the chip announces as two
                      bare numbers on the one surface where confusing the
                      screenshot with what the streamer saved is the whole
                      failure. The desktop panel says the same two words. */}
                  <span className="sr-only">screenshot </span>
                  <span>{m.screenshot}</span>
                  <span aria-hidden="true">→</span>
                  <span className="sr-only"> saved </span>
                  {m.entered == null ? (
                    // A blank is not a zero, and here it is the whole finding:
                    // the screenshot showed a number and the streamer saved
                    // nothing. Printing "0" would invent a measurement.
                    <NotEntered />
                  ) : (
                    <span className="font-medium text-red-600 dark:text-red-400">
                      {m.entered}
                    </span>
                  )}
                </span>
              ))}
              action={
                <button
                  type="button"
                  onClick={() => dismiss(a.auditId)}
                  aria-label={`Dismiss the alert for @${a.handle}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800"
                >
                  Dismiss
                </button>
              }
            />
          ))}
        </RecordList>
      </section>

      {/* ---- Desktop: today's panel, unchanged ---------------------------- */}
      <div className="mb-6 hidden rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 lg:block">
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
    </>
  );
}
