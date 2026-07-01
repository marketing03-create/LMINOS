"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = {
  ok: boolean;
  file_name?: string;
  total_rows?: number;
  parse_ok?: number;
  parse_errors?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  parse_error_detail?: { row: number; error: string }[];
  errors?: { row: number; error: string }[];
  error?: string;
};

export function SpendUploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/spend/upload", {
        method: "POST",
        body: form,
      });
      const json: Result = await res.json();
      setResult(json);
      if (res.ok) router.refresh();
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <>
      <label className="block border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-10 text-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900">
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onUpload}
          disabled={busy}
        />
        <div className="text-sm">
          {busy ? "Uploading…" : "Click to select a spend CSV"}
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          Re-upload is idempotent — same (platform, account, campaign, ad_set, ad, date) updates in place.
        </div>
      </label>

      {result && (
        <div className="mt-6 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 bg-white dark:bg-zinc-950">
          {result.error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-300">
              {result.error}
            </div>
          )}
          {result.total_rows != null && (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
              <Stat label="Total" value={result.total_rows} />
              <Stat label="Parsed ok" value={result.parse_ok ?? 0} />
              <Stat
                label="Inserted"
                value={result.inserted ?? 0}
                tone={result.inserted ? "emerald" : undefined}
              />
              <Stat
                label="Updated"
                value={result.updated ?? 0}
                tone={result.updated ? "blue" : undefined}
              />
              <Stat
                label="Skipped"
                value={(result.parse_errors ?? 0) + (result.skipped ?? 0)}
                tone={result.skipped || result.parse_errors ? "amber" : undefined}
              />
            </div>
          )}

          {(result.parse_error_detail?.length ?? 0) +
            (result.errors?.length ?? 0) >
            0 && (
            <div className="mt-5">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
                Errors
              </div>
              <ul className="space-y-1 text-xs font-mono max-h-80 overflow-y-auto">
                {result.parse_error_detail?.map((e, i) => (
                  <li
                    key={`p${i}`}
                    className="px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-900"
                  >
                    row {e.row}: {e.error}
                  </li>
                ))}
                {result.errors?.map((e, i) => (
                  <li
                    key={`i${i}`}
                    className="px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-900"
                  >
                    row {e.row}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "amber" | "blue";
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "blue"
          ? "text-blue-600 dark:text-blue-400"
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
