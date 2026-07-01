"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TEMPLATE = `customer_id,display_name,website,owning_gmail
123-456-7890,Dana Credit,dana_credit,owner1@gmail.com
456-789-0123,Apply KL Loan,apply_kl_loan,owner2@gmail.com`;

type Result = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  gmails: number;
  errors: { line: number; customerId: string; error: string }[];
};

export function BulkForm() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ad-accounts/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Failed (${res.status}).`);
        return;
      }
      setResult(json as Result);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <div className="text-sm font-medium mb-1">CSV format</div>
        <p className="text-xs text-zinc-500 mb-2">
          First row is a header. Only <b>customer_id</b> is required;{" "}
          <code>display_name</code>, <code>website</code> (slug), and{" "}
          <code>owning_gmail</code> are optional. Column names are flexible.
        </p>
        <pre className="text-[11px] bg-zinc-50 dark:bg-zinc-900 rounded-md p-3 overflow-x-auto text-zinc-600 dark:text-zinc-300">
          {TEMPLATE}
        </pre>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Upload a .csv file</label>
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">…or paste CSV</label>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          placeholder={TEMPLATE}
          className="w-full font-mono text-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2"
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy || !csv.trim()}
        className="inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {busy ? "Importing…" : "Import accounts"}
      </button>

      {result && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3">
          <div className="text-sm">
            ✓ <b>{result.created}</b> created · <b>{result.updated}</b> updated ·{" "}
            <b>{result.skipped}</b> skipped (of {result.total} rows)
          </div>
          {result.gmails > 0 && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs text-amber-900 dark:text-amber-300">
              These accounts span <b>{result.gmails}</b> owning Gmail(s) — you'll
              sign in once per Gmail to authorize reading them. Metrics stay empty
              until each Gmail is authorized.
            </div>
          )}
          {result.errors.length > 0 && (
            <div>
              <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                {result.errors.length} row(s) skipped:
              </div>
              <ul className="text-[11px] text-zinc-500 space-y-0.5 max-h-40 overflow-y-auto">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    line {e.line} {e.customerId ? `(${e.customerId})` : ""}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link
            href="/admin/ad-accounts"
            className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 text-sm"
          >
            View ad accounts →
          </Link>
        </div>
      )}
    </div>
  );
}
