"use client";

import Link from "next/link";
import { useState } from "react";
import { refreshEverywhere } from "@/app/actions/refresh-everywhere";

export type NudgeLive = {
  sessionId: string;
  handle: string;
  startedAt: string | null;
  missing: string[];
};

const whenFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * The admin's reminder, on the streamer's Home, until they tap Done.
 *
 * Folded by default to one line — the count — because that is the whole
 * message, and at full size the card pushed the streamer's own list off the
 * first screen. "Show more" unfolds every live still owing numbers, each a
 * link straight to its page.
 *
 * The count is re-checked on every render, so it falls as lives are filled in.
 * Done only appears once it reaches zero (the server refuses it earlier too):
 * then the card turns green, and Done is the one thing left to tap.
 */
export function AdminNudgeCard({ remaining }: { remaining: NudgeLive[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const n = remaining.length;
  const done = n === 0;

  async function finish() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/tiktok-live/nudge/done", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setErr(json.error ?? `Couldn't save (${res.status}).`);
        return;
      }
      await refreshEverywhere();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`mb-5 overflow-hidden rounded-2xl border border-l-[3px] bg-white shadow-sm dark:bg-zinc-950 ${
        done
          ? "border-emerald-200 border-l-emerald-500 dark:border-emerald-900 dark:border-l-emerald-400"
          : "border-amber-200 border-l-amber-500 dark:border-amber-900 dark:border-l-amber-400"
      }`}
    >
      <div className="px-4 pt-3 pb-3">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Reminder from admin
        </div>
        <h2 className="mt-0.5 text-[17px] font-semibold leading-snug tabular-nums">
          {done
            ? "All filled in ✓"
            : `${n} live${n === 1 ? "" : "s"} still need${n === 1 ? "s" : ""} numbers`}
        </h2>
      </div>

      {!done && open && (
        <ul id="nudge-lives" className="space-y-2 px-4 pb-3">
          {remaining.map((l) => (
            <li key={l.sessionId}>
              <Link
                href={`/tiktok-live/${l.sessionId}`}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 active:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-800 dark:active:bg-zinc-900"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium tabular-nums">
                    {l.startedAt ? whenFmt.format(new Date(l.startedAt)) : "Time not recorded"}
                    <span className="font-mono font-normal text-zinc-500 dark:text-zinc-400">
                      {" "}· @{l.handle}
                    </span>
                  </span>
                  <span className="block text-sm text-amber-700 dark:text-amber-400">
                    Missing {l.missing.join(", ")}
                  </span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-zinc-400">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!done && (
        // The card's footer: a full-width 44px row, so the whole bottom edge
        // is the target rather than two words of blue text.
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="nudge-lives"
          className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-zinc-100 px-4 text-sm font-medium text-blue-600 active:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:border-zinc-800 dark:text-blue-400 dark:active:bg-blue-950/30"
        >
          {open ? "Show less" : "Show more"}
          <span
            aria-hidden="true"
            className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </button>
      )}

      {done && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={finish}
            disabled={busy}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-5 text-[15px] font-medium text-white transition-colors active:bg-emerald-700 hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60 dark:focus-visible:ring-offset-zinc-950"
          >
            {busy ? "Saving…" : "Done"}
          </button>
          {err && (
            <p role="status" className="mt-2 text-sm text-red-600 dark:text-red-400">
              {err}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
