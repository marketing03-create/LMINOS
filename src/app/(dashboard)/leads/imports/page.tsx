"use client";

import { useState } from "react";

type UploadResult = {
  ok: boolean;
  total_rows: number;
  enqueued: number;
  skipped: number;
  errors: { row: number; error: string }[];
  file_hash?: string;
  error?: string;
};

export default function ImportsPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ingest/csv", { method: "POST", body: form });
      const json: UploadResult = await res.json();
      setResult(json);
    } catch (err) {
      setResult({
        ok: false,
        total_rows: 0,
        enqueued: 0,
        skipped: 0,
        errors: [],
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">CSV import</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Drop a CSV with at minimum <code>brand_slug</code>,{" "}
          <code>loan_type</code>, <code>phone</code>. Other columns are
          optional. Re-uploading the same file is a no-op (idempotent per row).
        </p>
      </header>

      <label className="block border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-10 text-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900">
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onUpload}
          disabled={busy}
        />
        <div className="text-sm">
          {busy ? "Uploading…" : "Click to select a CSV file"}
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          Max recommended size: 50,000 rows per upload
        </div>
      </label>

      {result && (
        <div className="mt-8 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 bg-white dark:bg-zinc-950">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Stat label="Total rows" value={result.total_rows} />
            <Stat label="Enqueued" value={result.enqueued} accent="emerald" />
            <Stat
              label="Skipped"
              value={result.skipped}
              accent={result.skipped > 0 ? "amber" : undefined}
            />
          </div>

          {result.error && (
            <div className="mt-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-300">
              {result.error}
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
                Per-row errors
              </div>
              <ul className="space-y-1 text-sm max-h-80 overflow-y-auto">
                {result.errors.map((e) => (
                  <li
                    key={e.row}
                    className="font-mono text-xs px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-900"
                  >
                    row {e.row}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "";
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}
