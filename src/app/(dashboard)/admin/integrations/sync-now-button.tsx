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

  async function onClick() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(cfg.endpoint, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
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
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={busy}
        className="h-9 px-4 rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 disabled:opacity-50 text-sm font-medium"
      >
        {busy ? cfg.busyLabel : cfg.label}
      </button>
      {msg && <span className="text-xs text-zinc-500">{msg}</span>}
    </div>
  );
}
