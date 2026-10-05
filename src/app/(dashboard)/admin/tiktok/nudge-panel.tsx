"use client";

import { useState } from "react";
import { refreshEverywhere } from "@/app/actions/refresh-everywhere";

export type NudgeRow = {
  streamerId: string;
  email: string;
  name: string | null;
  owed: number;
  pendingSince: string | null;
  doneAt: string | null;
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
 * Who still owes numbers, and the one button that tells them.
 *
 * The send is two taps on purpose: it reaches people (in-app, and Telegram for
 * anyone linked), so the first tap only turns the button into the question
 * "Send to 2 streamers?" — the count being the thing worth a second look.
 *
 * Each row's status answers the admin's follow-up, "did they do it?":
 * Waiting since the last send, or the time of their last Done. Nothing is
 * shown for a streamer never reminded.
 */
export function NudgePanel({ rows }: { rows: NudgeRow[] }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const owing = rows.filter((r) => r.owed > 0);
  const totalLives = owing.reduce((n, r) => n + r.owed, 0);
  const people = `${owing.length} streamer${owing.length === 1 ? "" : "s"}`;

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/tiktok-live/nudge", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setMsg({ tone: "err", text: json.error ?? `Couldn't send (${res.status}).` });
        return;
      }
      setMsg({
        tone: "ok",
        text: `Sent to ${json.streamers} streamer${json.streamers === 1 ? "" : "s"} ✓`,
      });
      setConfirming(false);
      await refreshEverywhere();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-8 flex justify-center">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Missing numbers</h2>
          <span className="shrink-0 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
            {totalLives === 0 ? "All in ✓" : `${totalLives} live${totalLives === 1 ? "" : "s"}`}
          </span>
        </div>

        {rows.length > 0 && (
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => {
              const status = r.pendingSince
                ? { tone: "amber", text: `Waiting · sent ${whenFmt.format(new Date(r.pendingSince))}` }
                : r.doneAt
                  ? { tone: "emerald", text: `Done ✓ ${whenFmt.format(new Date(r.doneAt))}` }
                  : null;
              return (
                <li key={r.streamerId} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="break-words text-[15px] font-medium leading-snug">
                      {r.name || r.email}
                    </div>
                    {status && (
                      <div
                        className={`mt-0.5 text-sm tabular-nums ${
                          status.tone === "amber"
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {status.text}
                      </div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-sm tabular-nums ${
                      r.owed > 0
                        ? "font-semibold text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {r.owed > 0 ? `${r.owed} live${r.owed === 1 ? "" : "s"}` : "All in"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4">
          {!confirming ? (
            <button
              type="button"
              onClick={() => {
                setMsg(null);
                setConfirming(true);
              }}
              disabled={owing.length === 0}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-[15px] font-medium text-white transition-colors active:bg-blue-700 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-40 disabled:hover:bg-blue-600 dark:focus-visible:ring-offset-zinc-950"
            >
              Notify streamers
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={send}
                disabled={busy}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 text-[15px] font-medium text-white transition-colors active:bg-blue-700 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950"
              >
                {busy ? "Sending…" : `Send to ${people}`}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-[15px] font-medium active:bg-zinc-100 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:active:bg-zinc-800 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
            </div>
          )}
          {msg && (
            <p
              role="status"
              className={`mt-2 text-sm ${
                msg.tone === "ok"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {msg.text}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
