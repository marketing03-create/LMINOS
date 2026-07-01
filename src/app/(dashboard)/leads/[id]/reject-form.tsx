"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const REASONS: { value: string; label: string }[] = [
  { value: "out_of_coverage", label: "Out of coverage / too far" },
  { value: "not_eligible", label: "Not eligible" },
  { value: "wrong_loan_type", label: "Wrong loan type" },
  { value: "docs_incomplete", label: "Documentation incomplete" },
  { value: "unreachable", label: "Customer unreachable" },
  { value: "duplicate_reusable", label: "Duplicate but reusable" },
  { value: "low_quality", label: "Low quality" },
  { value: "other", label: "Other" },
];

export function RejectLeadForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, notes }),
      });
      const json = await res.json();
      setMsg({
        ok: res.ok,
        text: res.ok ? "Rejected." : json.error ?? `HTTP ${res.status}`,
      });
      if (res.ok) {
        // Refresh server data so the page reflects the new status + recycle row.
        router.refresh();
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="h-10 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
      >
        <option value="">Reject reason…</option>
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="h-10 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
      />
      <div className="md:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !reason}
          className="h-10 px-5 rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 text-sm font-medium"
        >
          {busy ? "Rejecting…" : "Reject lead"}
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
      </div>
    </form>
  );
}
