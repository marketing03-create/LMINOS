"use client";

import { useState } from "react";
import { refreshEverywhere } from "@/app/actions/refresh-everywhere";
import { Panel, Section, StatusPill, btn } from "./ui";

/**
 * Google Sheet reports: per handle, a private link a Sheet pulls with
 * =IMPORTDATA(...) — one row per day (lib/reports/daily-core.ts). Create it,
 * copy the formula into cell A1, replace it if the link leaks.
 */

export type SheetReportView = {
  accountId: string;
  handle: string;
  /** The full formula for cell A1; null = no link yet. */
  formula: string | null;
  /** "5m ago" — when a Sheet last pulled it. */
  lastFetchedAgo: string | null;
};

async function act(accountId: string, action: "create" | "rotate" | "remove"): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/reports/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId, action }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return res.ok && j.ok ? null : (j.error ?? `Failed (${res.status}).`);
  } catch {
    return "Check your connection and try again.";
  }
}

export function SheetReports({ reports }: { reports: SheetReportView[] }) {
  return (
    <Section id="sheets" title="Google Sheet reports" meta="daily, per handle">
      <Panel>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {reports.map((r) => (
            <ReportRow key={r.accountId} r={r} />
          ))}
        </ul>
      </Panel>
    </Section>
  );
}

function ReportRow({ r }: { r: SheetReportView }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"rotate" | "remove" | null>(null);

  async function run(action: "create" | "rotate" | "remove") {
    setBusy(true);
    setErr(null);
    const e = await act(r.accountId, action);
    if (e) setErr(e);
    else await refreshEverywhere();
    setConfirm(null);
    setBusy(false);
  }

  async function copy() {
    if (!r.formula) return;
    try {
      await navigator.clipboard.writeText(r.formula);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this formula into cell A1", r.formula);
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">@{r.handle}</span>
          {r.formula ? (
            <StatusPill tone={r.lastFetchedAgo ? "ok" : "warn"}>
              {r.lastFetchedAgo ? `Sheet pulled ${r.lastFetchedAgo}` : "Not used by a Sheet yet"}
            </StatusPill>
          ) : (
            <StatusPill tone="off">No link</StatusPill>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {r.formula ? (
            <>
              <button type="button" onClick={copy} className={btn.primary}>
                {copied ? "Copied ✓" : "Copy formula"}
              </button>
              {confirm ? (
                <>
                  <button type="button" onClick={() => run(confirm)} disabled={busy} className={btn.danger}>
                    {confirm === "rotate" ? "Yes, new link" : "Yes, remove"}
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className={btn.secondary}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setConfirm("rotate")} className={btn.secondary}>
                    New link
                  </button>
                  <button type="button" onClick={() => setConfirm("remove")} className={btn.secondary}>
                    Remove
                  </button>
                </>
              )}
            </>
          ) : (
            <button type="button" onClick={() => run("create")} disabled={busy} className={btn.secondary}>
              {busy ? "Creating…" : "Create link"}
            </button>
          )}
        </div>
      </div>
      {confirm && (
        <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-400">
          {confirm === "rotate"
            ? "The current link stops working. Paste the new formula into the Sheet."
            : "The Sheet stops updating."}
        </p>
      )}
      {r.formula && !confirm && (
        <code className="mt-2 block truncate rounded-md bg-zinc-50 px-2.5 py-1.5 font-mono text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          {r.formula}
        </code>
      )}
      {err && (
        <p role="status" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {err}
        </p>
      )}
    </li>
  );
}
