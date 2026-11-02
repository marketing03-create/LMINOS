"use client";

import { useState } from "react";

/**
 * The masked number with a "Show" button. The full number is fetched one
 * customer at a time from an admin-only route that writes each reveal to the
 * Audit log; the page itself never carries it.
 */
export function RevealPhone({ id, last4 }: { id: string; last4: string }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function reveal() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/admin/whatsapp/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok && typeof j.phone === "string") setPhone(j.phone);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (phone) {
    return <span className="font-mono tabular-nums">+{phone}</span>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono tabular-nums">•••• {last4}</span>
      <button
        type="button"
        onClick={reveal}
        disabled={busy}
        className="inline-flex min-h-8 items-center rounded-md border border-zinc-300 px-2 text-xs font-medium text-zinc-600 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 lg:hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:active:bg-zinc-800 lg:dark:hover:bg-zinc-800"
      >
        {busy ? "…" : failed ? "Retry" : "Show"}
      </button>
    </span>
  );
}
