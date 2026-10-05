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

const SHOWN = 3;

/**
 * The admin's reminder, on the streamer's Home, until they tap Done.
 *
 * The count is re-checked on every render, so it falls as lives are filled in.
 * Done stays disabled until it reaches zero — the server refuses it too — and
 * then the card turns green: the one state where tapping it is the next step.
 * Each remaining live is a link straight to its page, so the card is also the
 * to-do list rather than a pointer to one.
 */
export function AdminNudgeCard({ remaining }: { remaining: NudgeLive[] }) {
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const n = remaining.length;
  const done = n === 0;
  const list = showAll ? remaining : remaining.slice(0, SHOWN);

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
      className={`mb-5 overflow-hidden rounded-2xl border border-l-[3px] bg-white p-4 shadow-sm dark:bg-zinc-950 ${
        done
          ? "border-emerald-200 border-l-emerald-500 dark:border-emerald-900 dark:border-l-emerald-400"
          : "border-amber-200 border-l-amber-500 dark:border-amber-900 dark:border-l-amber-400"
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Reminder from admin
      </div>
      <h2 className="mt-1 text-[17px] font-semibold leading-snug tabular-nums">
        {done ? "All filled in ✓" : `${n} live${n === 1 ? "" : "s"} still need${n === 1 ? "s" : ""} numbers`}
      </h2>

      {!done && (
        <ul className="mt-3 space-y-2">
          {list.map((l) => (
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
          {n > SHOWN && (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="inline-flex min-h-11 items-center text-sm font-medium text-blue-600 dark:text-blue-400"
              >
                {showAll ? "Show fewer" : `Show all ${n}`}
              </button>
            </li>
          )}
        </ul>
      )}

      <button
        type="button"
        onClick={finish}
        disabled={!done || busy}
        className={`mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl px-5 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 ${
          done
            ? "bg-emerald-600 text-white active:bg-emerald-700 hover:bg-emerald-500 focus-visible:ring-emerald-500"
            : "border border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
        } disabled:cursor-not-allowed ${busy ? "opacity-60" : ""}`}
      >
        {busy ? "Saving…" : "Done"}
      </button>
      {err && (
        <p role="status" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {err}
        </p>
      )}
    </section>
  );
}
