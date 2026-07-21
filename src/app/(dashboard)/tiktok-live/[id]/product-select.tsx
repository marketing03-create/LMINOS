"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProductPicker } from "@/components/product-picker";

/**
 * Tag a live session with the loan product(s)/service(s) the streamer promoted.
 * Multi-select — a live can push several. Saves on change to the same session
 * PATCH route the manual metrics use.
 */
export function ProductSelect({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: string[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(next: string[]) {
    setValue(next);
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(`/api/tiktok-live/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ products: next }),
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
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
        Product / service
      </h2>

      {err && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {err}
        </div>
      )}

      <ProductPicker value={value} onChange={save} disabled={busy} />

      <div className="mt-2 h-4 text-xs">
        {busy && <span className="text-zinc-500">Saving…</span>}
        {!busy && msg && (
          <span className="text-emerald-600 dark:text-emerald-400">{msg}</span>
        )}
      </div>
    </div>
  );
}
