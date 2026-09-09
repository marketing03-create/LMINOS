"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Pull TikTok Live data on demand. (The Sheets / Zoho / Google Ads variants left
 * with the leads/sales/ads features — those live in Adrify now.)
 */
type Variant = "tiktok";

const CONFIG: Record<
  Variant,
  { endpoint: string; label: string; busyLabel: string }
> = {
  tiktok: {
    endpoint: "/api/tiktok-live/sync",
    label: "Sync TikTok Live now",
    busyLabel: "Syncing TikTok…",
  },
};

export function SyncNowButton({ variant = "tiktok" }: { variant?: Variant }) {
  const router = useRouter();
  const cfg = CONFIG[variant];
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Purely how the message is painted — the POST, the parse and the refresh
  // below are untouched. A failed sync and a successful one currently read as
  // the same grey line of small print, which on a phone is the difference
  // between "31 sessions came in" and "nothing did" being invisible.
  const [failed, setFailed] = useState(false);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    setFailed(false);
    try {
      const res = await fetch(cfg.endpoint, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setFailed(true);
        setMsg(`HTTP ${res.status}: ${json.error ?? "failed"}`);
      } else {
        setMsg(
          `Provider ${json.provider ?? "none"} · ${json.accounts ?? 0} handles · ${
            json.sessions ?? 0
          } sessions${json.errors?.length ? ` · ${json.errors.length} errors` : ""}`
        );
      }
      if (res.ok) router.refresh();
    } catch (err) {
      setFailed(true);
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    /* Column on a phone, today's row from `lg` up. The result line is the whole
       point of pressing this — `Provider none · 4 handles · 31 sessions` — and
       in a nowrap flex row beside a 200px button it was left about 140px to say
       it in. Given its own line it just fits. */
    <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center lg:gap-3">
      <button
        onClick={onClick}
        disabled={busy}
        className="flex h-14 w-full items-center justify-center rounded-xl bg-zinc-900 px-4 text-base font-medium text-zinc-50 active:bg-zinc-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 lg:inline-flex lg:h-9 lg:w-auto lg:rounded-md lg:text-sm dark:bg-zinc-50 dark:text-zinc-900 dark:active:bg-zinc-200"
      >
        {busy ? cfg.busyLabel : cfg.label}
      </button>
      {msg && (
        <span
          className={`text-sm lg:text-xs ${
            failed
              ? "text-rose-600 dark:text-rose-400"
              : "text-zinc-500"
          }`}
        >
          {msg}
        </span>
      )}
      {/* The visible line appears out of nowhere, so it needs a region that was
          already there to announce it — otherwise a screen-reader user presses
          Sync and is told nothing at all, either way. Absolutely positioned, so
          it never becomes a flex item and never adds a gap. */}
      <span role="status" aria-live="polite" className="sr-only">
        {msg ?? (busy ? cfg.busyLabel : "")}
      </span>
    </div>
  );
}
