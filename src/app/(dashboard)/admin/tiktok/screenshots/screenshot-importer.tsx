"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AUTO_COLUMNS } from "@/lib/tiktok-live/screenshot-extract-core";
import type { ReviewGroup, ReviewPayload } from "@/lib/tiktok-live/import-screenshots";

const AUTO_SET = new Set<string>(AUTO_COLUMNS);

const LABELS: Record<string, string> = {
  totalViews: "Views",
  peakViewers: "Peak viewers",
  avgViewers: "Avg viewers",
  totalLikes: "Likes",
  totalComments: "Comments",
  totalShares: "Shares",
  newFollowers: "New followers",
  uniqueViewers: "Unique viewers",
  activeViewers: "Active viewers",
  avgWatchSeconds: "Avg watch (sec)",
  directMessages: "Direct messages",
  serviceBioViews: "Service bio views",
  interestedViewers: "Interested viewers",
  diamonds: "Diamonds",
};

type RowState = {
  selectedSessionId: string;
  values: Record<string, number>;
  applied: boolean;
  msg: string | null;
};

function fmtWhen(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-MY", { hour12: false });
}

export function ScreenshotImporter() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function read() {
    if (!files.length) return;
    setReading(true);
    setError(null);
    setReview(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("images", f));
      const res = await fetch("/api/tiktok-live/sessions/screenshots", {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setError(json.error ?? `Request failed (${res.status}).`);
        return;
      }
      const payload = json as ReviewPayload;
      setReview(payload);
      setRows(
        payload.groups.map((g) => ({
          selectedSessionId: g.bestMatchSessionId ?? "",
          values: { ...(g.values as Record<string, number>) },
          applied: false,
          msg: null,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  }

  function patchRow(idx: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function setVal(idx: number, col: string, v: string) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const values = { ...r.values };
        if (v.trim() === "") delete values[col];
        else values[col] = Math.max(0, Math.round(Number(v) || 0));
        return { ...r, values };
      })
    );
  }

  async function apply(idx: number, g: ReviewGroup) {
    const row = rows[idx];
    if (!row.selectedSessionId) {
      patchRow(idx, { msg: "Pick a live to attach this to first." });
      return;
    }
    if (Object.keys(row.values).length === 0) {
      patchRow(idx, { msg: "No numbers to apply." });
      return;
    }
    setBusyKey(g.key);
    patchRow(idx, { msg: null });
    try {
      const res = await fetch(
        `/api/tiktok-live/sessions/${row.selectedSessionId}/apply-screenshot`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ values: row.values }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        patchRow(idx, { msg: json.error ?? `Failed (${res.status}).` });
        return;
      }
      patchRow(idx, { applied: true, msg: "Applied ✓" });
      router.refresh();
    } catch (e) {
      patchRow(idx, { msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload box */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-sm"
        />
        <button onClick={read} disabled={reading || files.length === 0} className={btnPrimary}>
          {reading ? "Reading…" : `Read ${files.length || ""} screenshot${files.length === 1 ? "" : "s"}`.trim()}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {review && review.groups.length === 0 && (
        <div className="text-sm text-zinc-500">No metrics could be read from those images.</div>
      )}

      {review &&
        review.groups.map((g, idx) => {
          const row = rows[idx];
          const sel = review.sessions.find((s) => s.sessionId === row.selectedSessionId);
          const cols = Object.keys(row.values);
          const autoCols = cols.filter((c) => AUTO_SET.has(c));
          const manualCols = cols.filter((c) => !AUTO_SET.has(c));
          return (
            <div
              key={g.key}
              className={`border rounded-xl bg-white dark:bg-zinc-950 p-5 space-y-4 ${
                row.applied
                  ? "border-emerald-300 dark:border-emerald-800"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">
                  {g.date ? `Live on ${g.date}` : "Unattached extras"}
                  {g.startTime ? ` · ${g.startTime}` : ""}
                </span>
                {g.handle && <span className="text-xs font-mono text-zinc-500">@{g.handle}</span>}
                {g.sourceTabs.map((t, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                    {t}
                  </span>
                ))}
                {g.needsAttach && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
                    no date — pick a live
                  </span>
                )}
              </div>

              {g.conflicts.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  {g.conflicts.join(" · ")}
                </div>
              )}

              {/* Matched-live selector */}
              <label className="block">
                <div className="text-xs font-medium mb-1">Apply to live</div>
                <select
                  value={row.selectedSessionId}
                  onChange={(e) => patchRow(idx, { selectedSessionId: e.target.value, applied: false, msg: null })}
                  disabled={row.applied}
                  className={inputCls + " w-full max-w-lg"}
                >
                  <option value="">— pick a live —</option>
                  {review.sessions.map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      @{s.handle} · {fmtWhen(s.startedAt as unknown as string)}
                      {s.title ? ` · ${s.title}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {autoCols.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                    Corrections to captured numbers
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {autoCols.map((c) => {
                      const cur = sel?.current?.[c];
                      const changed = cur != null && cur !== row.values[c];
                      return (
                        <label key={c} className="block">
                          <div className="text-xs font-medium mb-1">{LABELS[c] ?? c}</div>
                          <input
                            inputMode="numeric"
                            value={row.values[c] ?? ""}
                            onChange={(e) => setVal(idx, c, e.target.value)}
                            disabled={row.applied}
                            className={inputCls + " w-full tabular-nums"}
                          />
                          <div className="mt-0.5 text-[11px] text-zinc-400">
                            now {cur ?? "—"}
                            {changed ? <span className="text-emerald-600 dark:text-emerald-400"> → {row.values[c]}</span> : ""}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {manualCols.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                    New extras (TikTok-only)
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {manualCols.map((c) => (
                      <label key={c} className="block">
                        <div className="text-xs font-medium mb-1">{LABELS[c] ?? c}</div>
                        <input
                          inputMode="numeric"
                          value={row.values[c] ?? ""}
                          onChange={(e) => setVal(idx, c, e.target.value)}
                          disabled={row.applied}
                          className={inputCls + " w-full tabular-nums"}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => apply(idx, g)}
                  disabled={row.applied || busyKey === g.key}
                  className={row.applied ? btnDone : btnPrimary}
                >
                  {row.applied ? "Applied ✓" : busyKey === g.key ? "Applying…" : "Apply to this live"}
                </button>
                {row.msg && !row.applied && <span className="text-xs text-zinc-500">{row.msg}</span>}
              </div>
            </div>
          );
        })}
    </div>
  );
}

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100";
const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
const btnDone =
  "inline-flex items-center rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-70";
