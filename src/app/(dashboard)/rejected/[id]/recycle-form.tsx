"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RecycleForm({ rejectedId }: { rejectedId: string }) {
  const router = useRouter();
  const [overrideLoanType, setOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onRecycle() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/rejected/${rejectedId}/recycle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          override_loan_type: overrideLoanType || undefined,
        }),
      });
      const json = await res.json();
      setMsg({
        ok: res.ok,
        text: res.ok
          ? `Recycled → ${json.new_lead_id?.slice(0, 8)}…`
          : json.error ?? `HTTP ${res.status}`,
      });
      if (res.ok) router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function onMarkResale() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/rejected/${rejectedId}/mark-resale`, {
        method: "POST",
      });
      const json = await res.json();
      setMsg({
        ok: res.ok,
        text: res.ok ? "Marked resale-eligible." : json.error ?? `HTTP ${res.status}`,
      });
      if (res.ok) router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={overrideLoanType}
          onChange={(e) => setOverride(e.target.value)}
          className="h-9 px-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
        >
          <option value="">Keep original loan type</option>
          <option value="personal">Reallocate → Personal</option>
          <option value="bank">Reallocate → Bank</option>
          <option value="angkasa">Reallocate → Angkasa</option>
          <option value="car">Reallocate → Car</option>
          <option value="sme">Reallocate → SME</option>
        </select>
        <button
          onClick={onRecycle}
          disabled={busy}
          className="h-9 px-4 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
        >
          {busy ? "…" : "♻️ Recycle into new lead"}
        </button>
      </div>
      <button
        onClick={onMarkResale}
        disabled={busy}
        className="h-9 px-4 rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 disabled:opacity-50 text-xs"
      >
        Mark resale-eligible only
      </button>
      {msg && (
        <div
          className={`text-xs ${
            msg.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
