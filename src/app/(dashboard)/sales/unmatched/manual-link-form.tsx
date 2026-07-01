"use client";

import { useState } from "react";

export function ManualLinkForm({ salesRecordId }: { salesRecordId: string }) {
  const [leadId, setLeadId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/sales/${salesRecordId}/match`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead_id: leadId.trim() }),
      });
      const json = await res.json();
      setMsg({
        ok: res.ok,
        text: res.ok ? "Linked." : json.error ?? `HTTP ${res.status}`,
      });
      if (res.ok) setLeadId("");
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={leadId}
        onChange={(e) => setLeadId(e.target.value)}
        placeholder="Paste lead id (uuid)"
        className="flex-1 h-9 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-mono"
      />
      <button
        type="submit"
        disabled={busy || !leadId.trim()}
        className="h-9 px-4 rounded-md bg-zinc-900 text-zinc-50 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium dark:bg-zinc-50 dark:text-zinc-900"
      >
        {busy ? "Linking…" : "Link"}
      </button>
      {msg && (
        <span
          className={`text-xs ${
            msg.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {msg.text}
        </span>
      )}
    </form>
  );
}
