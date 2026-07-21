"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Variant = "sheets" | "zoho" | "tiktok" | "google";

const CONFIG: Record<
  Variant,
  { endpoint: string; label: string; busyLabel: string }
> = {
  sheets: {
    endpoint: "/api/sales/sync",
    label: "Sync Google Sheets now",
    busyLabel: "Syncing…",
  },
  zoho: {
    endpoint: "/api/zoho/sync",
    label: "Sync Zoho now",
    busyLabel: "Syncing Zoho…",
  },
  tiktok: {
    endpoint: "/api/tiktok-live/sync",
    label: "Sync TikTok Live now",
    busyLabel: "Syncing TikTok…",
  },
  google: {
    endpoint: "/api/google-ads/sync",
    label: "Sync Google Ads now",
    busyLabel: "Syncing Google Ads…",
  },
};

export function SyncNowButton({ variant = "sheets" }: { variant?: Variant }) {
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
      } else if (variant === "zoho") {
        setMsg(
          `Fetched ${json.fetched ?? 0} · leads ${json.leadsUpserted ?? 0} · sales ${
            json.salesUpserted ?? 0
          }${json.errors?.length ? ` · ${json.errors.length} errors` : ""}`
        );
      } else if (variant === "tiktok") {
        setMsg(
          `Provider ${json.provider ?? "none"} · ${json.accounts ?? 0} handles · ${
            json.sessions ?? 0
          } sessions${json.errors?.length ? ` · ${json.errors.length} errors` : ""}`
        );
      } else if (variant === "google") {
        setMsg(
          `${json.accounts ?? 0} accounts · ${json.rowsUpserted ?? 0} spend · ${
            json.keywords?.keywordRows ?? 0
          } keywords · ${json.keywords?.searchTermRows ?? 0} search terms${
            json.errors?.length ? ` · ${json.errors.length} errors` : ""
          }`
        );
      } else {
        setMsg(`Synced ${json.results?.length ?? 0} tab(s).`);
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
