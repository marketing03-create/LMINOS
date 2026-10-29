"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type ChooserOption = {
  accountId: string;
  handle: string;
  streamer: string | null;
  sessions: number;
  isActive: boolean;
};

/**
 * "Choose streamer" — a compact dropdown in the page header (beside Screenshot
 * history) that opens each handle's performance page, or the combined view.
 *
 * It used to be a large centred card that took the first screen of the page
 * to offer a list of links. The same choices now live behind one button, so
 * the page underneath (tracker status, missing numbers, alerts, handles) is
 * what an admin sees first.
 *
 * Closes on outside tap, on Escape, and when a choice is made. Each row keeps
 * the handle, its streamer and its live count, and says "Paused" in full ink —
 * the one word on the row that changes what the numbers behind it mean.
 */
export function StreamerChooser({ options }: { options: ChooserOption[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const row =
    "block min-h-11 px-4 py-2.5 hover:bg-zinc-50 active:bg-zinc-100 focus-visible:bg-zinc-50 focus-visible:outline-none dark:hover:bg-zinc-800/60 dark:active:bg-zinc-800 dark:focus-visible:bg-zinc-800/60";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="streamer-menu"
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:min-h-0 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-800"
      >
        Choose streamer
        <span aria-hidden="true" className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <div
          id="streamer-menu"
          className="absolute right-0 z-30 mt-2 max-h-[70vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          <Link href="/admin/tiktok/all" onClick={() => setOpen(false)} className={row}>
            <div className="text-sm font-medium">All streamers</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Combined</div>
          </Link>
          {options.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
              No handles registered yet.
            </p>
          ) : (
            options.map((o) => (
              <Link
                key={o.accountId}
                href={`/admin/tiktok/${o.accountId}`}
                onClick={() => setOpen(false)}
                className={`${row} border-t border-zinc-100 dark:border-zinc-800`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-sm font-medium">@{o.handle}</span>
                  {!o.isActive && (
                    <span className="shrink-0 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Paused
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {o.streamer ?? "unassigned"} · {o.sessions} {o.sessions === 1 ? "live" : "lives"}
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
