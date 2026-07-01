"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const FIELDS = [
  { key: "uniqueViewers", label: "Unique viewers", hint: "" },
  { key: "activeViewers", label: "Active viewers", hint: "" },
  { key: "avgWatchSeconds", label: "Avg watch (seconds)", hint: "e.g. 52" },
  { key: "directMessages", label: "Direct messages", hint: "" },
  { key: "serviceBioViews", label: "Service bio views", hint: "" },
  { key: "interestedViewers", label: "Interested viewers", hint: "" },
  { key: "diamonds", label: "Diamonds", hint: "" },
] as const;

type Key = (typeof FIELDS)[number]["key"];
type Vals = Record<Key, string>;

export function ManualMetricsForm({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: Record<Key, number | null>;
}) {
  const router = useRouter();
  const [vals, setVals] = useState<Vals>(() => {
    const o = {} as Vals;
    for (const f of FIELDS) o[f.key] = initial[f.key] == null ? "" : String(initial[f.key]);
    return o;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    const body: Record<string, number | null> = {};
    for (const f of FIELDS) {
      const v = vals[f.key].trim();
      body[f.key] = v === "" ? null : Number(v);
    }
    try {
      const res = await fetch(`/api/tiktok-live/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setErr(json.error ?? `Failed (${res.status}).`);
        return;
      }
      setMsg("Saved.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
        TikTok backend numbers
      </h2>
      <p className="mt-1 mb-4 text-xs text-zinc-500">
        The TikTok-only metrics our live connector can&apos;t capture. Read them off
        <b> TikTok Studio → Analytics → LIVE</b> and type them here. Leave blank if
        unknown. <span className="text-zinc-400">(Admins only.)</span>
      </p>

      {err && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {err}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <div className="text-xs font-medium mb-1">{f.label}</div>
            <input
              inputMode="numeric"
              value={vals[f.key]}
              onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.hint || "—"}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm tabular-nums"
            />
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save numbers"}
        </button>
        {msg && <span className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</span>}
      </div>
    </div>
  );
}
