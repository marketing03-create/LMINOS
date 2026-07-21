"use client";

import { useState } from "react";
import type { AnalysisRow } from "./search-terms-client";

const MATCH_OPTIONS = ["EXACT", "PHRASE", "BROAD", "NONE"];
const LEVEL_OPTIONS = ["CAMPAIGN", "AD_GROUP", "SHARED_LIST", "ACCOUNT", "NONE"];

/**
 * Slide-over showing the full AI explanation for one term, its metrics, overlap
 * warnings, and a reviewer edit form (negative keyword / match / level / notes).
 * Approve / reject / apply act on this single row. Apply is dark until write
 * access is granted (parent passes writeEnabled).
 */
export function DetailDrawer({
  row,
  writeEnabled,
  onClose,
  onChanged,
}: {
  row: AnalysisRow;
  writeEnabled: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [negKw, setNegKw] = useState(
    row.editedNegativeKeyword ?? row.suggestedNegativeKeyword ?? ""
  );
  const [match, setMatch] = useState(
    row.editedMatchType ?? row.suggestedMatchType ?? "PHRASE"
  );
  const [level, setLevel] = useState(row.editedLevel ?? row.suggestedLevel ?? "CAMPAIGN");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      throw new Error(json.error ?? `Request failed (${res.status}).`);
    }
    return json;
  }

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      onChanged();
      if (action !== "apply") onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", () =>
      call(`/api/search-terms/${row.id}`, "PATCH", {
        editedNegativeKeyword: negKw,
        editedMatchType: match,
        editedLevel: level,
        notes,
      })
    );
  const approve = () =>
    run("approve", () => call(`/api/search-terms/${row.id}/approve`, "POST"));
  const reject = () =>
    run("reject", () => call(`/api/search-terms/${row.id}/reject`, "POST"));
  const apply = () =>
    run("apply", async () => {
      const json = (await call(`/api/search-terms/${row.id}/apply`, "POST")) as {
        message?: string;
        applied?: boolean;
      };
      setApplyMsg(
        json.applied
          ? "Applied to Google Ads."
          : json.message ?? "Validated against Google — apply by hand."
      );
    });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full overflow-y-auto bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Search term</div>
            <div className="text-lg font-semibold break-words">{row.term}</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {row.campaignName ?? "—"} · {row.language ?? "—"} · {row.intentCategory ?? "—"}
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          <Tag>{row.decision}</Tag>
          <Tag>{row.reviewStatus.replace("_", " ").toLowerCase()}</Tag>
          {row.riskLevel && <Tag>risk: {row.riskLevel}</Tag>}
          <Tag>relevance {row.relevanceScore ?? "—"}</Tag>
          <Tag>confidence {row.confidenceScore ?? "—"}</Tag>
          {row.needsHumanReview && <Tag warn>needs review</Tag>}
          {row.ruleApplied && <Tag warn>rule: {row.ruleApplied}</Tag>}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <Metric label="Clicks" value={row.clicks ?? "—"} />
          <Metric label="Cost" value={row.spend != null ? `RM${row.spend.toFixed(0)}` : "—"} />
          <Metric label="Conv" value={row.conversions ?? "—"} />
          <Metric
            label="Cost/conv"
            value={row.costPerConv != null ? `RM${row.costPerConv.toFixed(0)}` : "—"}
          />
        </div>

        <Section title="Why">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{row.reason}</p>
        </Section>

        {row.riskExplanation && (
          <Section title="Risk">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{row.riskExplanation}</p>
          </Section>
        )}

        {row.overlapWarning && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            ⚠ {row.overlapWarning}
          </div>
        )}

        <Section title="AI original">
          <p className="text-xs text-zinc-500 font-mono">
            {row.suggestedNegativeKeyword || "—"}
            {row.suggestedMatchType && row.suggestedMatchType !== "NONE"
              ? ` · ${row.suggestedMatchType}`
              : ""}
            {row.suggestedLevel && row.suggestedLevel !== "NONE"
              ? ` · ${row.suggestedLevel}`
              : ""}
          </p>
        </Section>

        {/* Edit form */}
        <Section title="Reviewer override">
          <div className="space-y-2">
            <input
              className={`${inputCls} w-full font-mono`}
              value={negKw}
              onChange={(e) => setNegKw(e.target.value)}
              placeholder="negative keyword"
            />
            <div className="grid grid-cols-2 gap-2">
              <select className={`${inputCls} w-full`} value={match} onChange={(e) => setMatch(e.target.value)}>
                {MATCH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select className={`${inputCls} w-full`} value={level} onChange={(e) => setLevel(e.target.value)}>
                {LEVEL_OPTIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className={`${inputCls} w-full`}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="notes (optional)"
            />
            <button onClick={save} disabled={busy === "save"} className={btnSmall}>
              {busy === "save" ? "Saving…" : "Save edits"}
            </button>
          </div>
        </Section>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}
        {applyMsg && (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
            {applyMsg}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={approve} disabled={busy === "approve"} className={btnApprove}>
            Approve
          </button>
          <button onClick={reject} disabled={busy === "reject"} className={btnSmall}>
            Reject
          </button>
          {(row.reviewStatus === "APPROVED" || row.reviewStatus === "EDITED") &&
            row.decision === "EXCLUDE" && (
              <button onClick={apply} disabled={busy === "apply"} className={btnApply}>
                {busy === "apply"
                  ? "Applying…"
                  : writeEnabled
                    ? "Apply to Google"
                    : "Validate (dry-run)"}
              </button>
            )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{title}</div>
      {children}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
function Tag({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full ${
        warn
          ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
      }`}
    >
      {children}
    </span>
  );
}

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";
const btnApprove =
  "inline-flex items-center rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50";
const btnApply =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50";
const btnSmall =
  "inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 text-xs disabled:opacity-50";
