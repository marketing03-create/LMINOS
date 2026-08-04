"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AUTO_COLUMNS } from "@/lib/tiktok-live/screenshot-extract-core";
import { ProductPicker } from "@/components/product-picker";
import { LivePicker } from "@/components/live-picker";
import type { ReviewGroup, ReviewPayload } from "@/lib/tiktok-live/import-screenshots";

const AUTO_SET = new Set<string>(AUTO_COLUMNS);
// Every TikTok-only "service panel" metric (all MANUAL_TIKTOK_FIELDS except the
// Total/Filtered Leads counts, which have their own section). ALWAYS shown as
// input fields — even when a screenshot didn't capture them — with a "—"
// placeholder, so the streamer is reminded to key in whatever's missing.
// Hardcoded (not imported from queries.ts) to keep server code out of this
// client bundle; keep in sync with MANUAL_TIKTOK_FIELDS.
const ALWAYS_MANUAL = [
  "uniqueViewers",
  "activeViewers",
  "avgWatchSeconds",
  "directMessages",
  "serviceBioViews",
  "interestedViewers",
  "diamonds",
] as const;
const ALWAYS_MANUAL_SET = new Set<string>(ALWAYS_MANUAL);
const sameProducts = (a: string[], b: string[]) =>
  [...a].sort().join("|") === [...b].sort().join("|");

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
  totalLeads: "Total Leads",
  filteredLeads: "Filtered Leads",
};

type RowState = {
  selectedSessionId: string;
  // Product(s)/service(s) the streamer promoted in this live ([] = not tagged).
  selectedProducts: string[];
  // Free-text note about this live (pre-filled from the matched session).
  remarks: string;
  values: Record<string, number>;
  applied: boolean;
  msg: string | null;
};

// Each block in a live's form sits in its own soft card, matching the reference
// case-details layout — distinct steps instead of one long list.
const SECTION =
  "rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50";

// Shrink a screenshot in the browser BEFORE uploading. Claude's vision resizes
// anything over ~1568px on the long edge server-side anyway, so sending a full
// phone screenshot (2–3 MB) just wastes upload time — worst on mobile, which is
// exactly where streamers upload from after a live. We cap the long edge and
// re-encode as JPEG. Falls back to the original file on any error / if the
// re-encode wouldn't actually be smaller (readability is unchanged either way).
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

async function downscaleForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 600_000) return file; // already small — skip re-encode
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    // White backing so a transparent PNG doesn't turn black once it's JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file; // no gain — keep original
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function ScreenshotImporter() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Which live is expanded. Only one open at a time so several screenshots stay
  // a short stack of summary rows instead of one very long form.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  async function read() {
    if (!files.length) return;
    setReading(true);
    setError(null);
    setReview(null);
    try {
      // Shrink each image in the browser first so the upload is small + fast.
      const prepared = await Promise.all(files.map(downscaleForUpload));
      const fd = new FormData();
      prepared.forEach((f) => fd.append("images", f));
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
        payload.groups.map((g) => {
          // Pre-fill the product dropdown from whatever the matched live is
          // already tagged with (blank if untagged or unmatched).
          const match = g.bestMatchSessionId
            ? payload.sessions.find((s) => s.sessionId === g.bestMatchSessionId)
            : undefined;
          return {
            selectedSessionId: g.bestMatchSessionId ?? "",
            selectedProducts: match?.products ?? [],
            remarks: match?.remarks ?? "",
            values: { ...(g.values as Record<string, number>) },
            applied: false,
            msg: null,
          };
        })
      );
      // Open the first live; the rest stay collapsed.
      setExpandedKey(payload.groups[0]?.key ?? null);
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
    // Save the product tag too when it differs from what the live already has.
    const target = review?.sessions.find((s) => s.sessionId === row.selectedSessionId);
    const productChanged = !sameProducts(row.selectedProducts, target?.products ?? []);
    const remarksChanged = (row.remarks ?? "").trim() !== (target?.remarks ?? "").trim();
    const hasNumbers = Object.keys(row.values).length > 0;
    if (!hasNumbers && !productChanged && !remarksChanged) {
      patchRow(idx, { msg: "Nothing to apply." });
      return;
    }
    setBusyKey(g.key);
    patchRow(idx, { msg: null });
    try {
      // 1) Tag the product/service + remarks (session PATCH, separate from the
      // numbers apply, so it still saves even when every captured number is locked).
      if (productChanged || remarksChanged) {
        const patchBody: Record<string, unknown> = {};
        if (productChanged) patchBody.products = row.selectedProducts;
        if (remarksChanged)
          patchBody.remarks = row.remarks.trim() === "" ? null : row.remarks.trim();
        const pRes = await fetch(`/api/tiktok-live/sessions/${row.selectedSessionId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        const pJson = await pRes.json().catch(() => ({}));
        if (!pRes.ok || pJson.ok === false) {
          patchRow(idx, { msg: pJson.error ?? `Save failed (${pRes.status}).` });
          return;
        }
      }
      // 2) Apply the read numbers.
      if (hasNumbers) {
        const res = await fetch(
          `/api/tiktok-live/sessions/${row.selectedSessionId}/apply-screenshot`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            // Send what the AI READ (g.values, immutable) alongside the final
            // (possibly edited) values, so the server can flag streamer mismatches.
            body: JSON.stringify({ values: row.values, screenshotValues: g.values }),
          }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.ok === false) {
          patchRow(idx, { msg: json.error ?? `Failed (${res.status}).` });
          return;
        }
      }
      patchRow(idx, { applied: true, msg: "Applied ✓ — opening this live to verify…" });
      // Green for a beat, then open this live's detail page to check the metrics.
      const sid = row.selectedSessionId;
      setTimeout(() => router.push(`/tiktok-live/${sid}`), 1500);
    } catch (e) {
      patchRow(idx, { msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload box */}
      <div className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium">Add your LIVE screenshots</div>
            <div className="text-[11px] text-zinc-500">PNG or JPG · pick several at once</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="min-w-0 flex-1 text-sm text-zinc-500 file:mr-3 file:cursor-pointer file:rounded-md file:border-2 file:border-zinc-400 file:bg-zinc-200 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-800 hover:file:bg-zinc-300 dark:file:border-zinc-500 dark:file:bg-zinc-700 dark:file:text-zinc-100 dark:hover:file:bg-zinc-600"
          />
          <button
            onClick={read}
            disabled={reading || files.length === 0}
            className="inline-flex shrink-0 items-center whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {reading ? "Reading…" : files.length ? `Read (${files.length})` : "Read"}
          </button>
        </div>
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
          // Columns are FIXED to what the screenshot read (g.values, immutable) —
          // never derived from the editable row.values, so clearing a field just
          // blanks its input instead of making the whole column disappear.
          const cols = Object.keys(g.values as Record<string, number>);
          const autoCols = cols.filter((c) => AUTO_SET.has(c));
          // Manual extras the screenshot happened to include (excluding the
          // always-shown service fields + the lead counts, which have their own
          // sections), then prepend DMs + Bio Views so they're always prompted.
          const readManual = cols.filter(
            (c) =>
              !AUTO_SET.has(c) &&
              !ALWAYS_MANUAL_SET.has(c) &&
              c !== "totalLeads" &&
              c !== "filteredLeads"
          );
          const manualCols = [...ALWAYS_MANUAL, ...readManual];
          const expanded = expandedKey === g.key;
          return (
            <div
              key={g.key}
              className={`border rounded-xl bg-white dark:bg-zinc-950 ${
                row.applied
                  ? "border-emerald-300 dark:border-emerald-800"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              {/* Tappable summary — collapses each live so several screenshots
                  don't stack into one giant form. Only one is open at a time. */}
              <button
                type="button"
                onClick={() => setExpandedKey(expanded ? null : g.key)}
                aria-expanded={expanded}
                className={`flex w-full items-center gap-2 bg-white/95 p-4 text-left backdrop-blur dark:bg-zinc-950/95 ${
                  expanded
                    ? "sticky top-0 z-10 rounded-t-xl border-b border-zinc-100 dark:border-zinc-900"
                    : "rounded-xl"
                }`}
              >
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-semibold">
                    {g.date ? `Live on ${g.date}` : "Unattached extras"}
                    {g.startTime ? ` · ${g.startTime}` : ""}
                  </span>
                  {g.handle && (
                    <span className="text-[11px] font-mono text-zinc-500">@{g.handle}</span>
                  )}
                  {row.applied && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      Applied ✓
                    </span>
                  )}
                  {g.needsAttach && !row.applied && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                      pick a live
                    </span>
                  )}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className={`shrink-0 text-zinc-400 transition-transform ${
                    expanded ? "rotate-180" : ""
                  }`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {expanded && (
                <div className="space-y-3 px-4 pb-4 pt-3">

              {g.conflicts.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  {g.conflicts.join(" · ")}
                </div>
              )}

              {/* Matched-live selector + product/service tag, side by side */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="block flex-1">
                  <div className="text-xs font-medium mb-1">Apply to live</div>
                  <LivePicker
                    lives={review.sessions}
                    value={row.selectedSessionId}
                    onChange={(sid) => {
                      // Switching the target live re-syncs the product picker to
                      // whatever that live is already tagged with.
                      const sess = review.sessions.find((s) => s.sessionId === sid);
                      patchRow(idx, {
                        selectedSessionId: sid,
                        selectedProducts: sess?.products ?? [],
                        remarks: sess?.remarks ?? "",
                        applied: false,
                        msg: null,
                      });
                    }}
                    disabled={row.applied}
                  />
                </div>

                <div className="block sm:w-auto">
                  <div className="text-xs font-medium mb-1">
                    Product / service <span className="text-zinc-400">(tick all that apply)</span>
                  </div>
                  <ProductPicker
                    value={row.selectedProducts}
                    onChange={(next) =>
                      patchRow(idx, { selectedProducts: next, applied: false, msg: null })
                    }
                    disabled={row.applied}
                  />
                </div>
              </div>

              {autoCols.length > 0 && (
                <div className={SECTION}>
                  <div className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                    Corrections to captured numbers
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 gap-y-2.5">
                    {autoCols.map((c) => {
                      const cur = sel?.current?.[c];
                      const changed =
                        cur != null && row.values[c] != null && cur !== row.values[c];
                      return (
                        <label key={c} className="block">
                          <div className="text-[13px] font-medium mb-1 text-zinc-600 dark:text-zinc-400">{LABELS[c] ?? c}</div>
                          <input
                            inputMode="numeric"
                            value={row.values[c] ?? ""}
                            onChange={(e) => setVal(idx, c, e.target.value)}
                            disabled={row.applied}
                            className={inputCls + " w-full tabular-nums"}
                          />
                          <div className="mt-0.5 text-[11px] text-zinc-400">
                            now {cur ?? "—"}
                            {changed ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                {" "}
                                → {row.values[c]}
                              </span>
                            ) : (
                              ""
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {manualCols.length > 0 && (
                <div className={SECTION}>
                  <div className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                    Service panel (TikTok-only)
                    <span className="ml-1 font-normal normal-case text-zinc-400">
                      — key in any the screenshot didn&apos;t show
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 gap-y-2.5">
                    {manualCols.map((c) => (
                      <label key={c} className="block">
                        <div className="text-[13px] font-medium mb-1 text-zinc-600 dark:text-zinc-400">{LABELS[c] ?? c}</div>
                        <input
                          inputMode="numeric"
                          value={row.values[c] ?? ""}
                          onChange={(e) => setVal(idx, c, e.target.value)}
                          disabled={row.applied}
                          placeholder="—"
                          className={inputCls + " w-full tabular-nums"}
                        />
                        <div className="mt-0.5 text-[11px] text-zinc-400">
                          now {sel?.current?.[c] ?? "—"}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Lead counts — CS enters these by hand; never on a screenshot. */}
              <div className={SECTION}>
                <div className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Customer-service follow-up
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="block sm:w-48">
                    <div className="text-sm font-medium mb-1">Total Leads</div>
                    <input
                      inputMode="numeric"
                      value={row.values.totalLeads ?? ""}
                      onChange={(e) => setVal(idx, "totalLeads", e.target.value)}
                      disabled={row.applied}
                      placeholder="—"
                      className={inputCls + " w-full tabular-nums"}
                    />
                    <div className="mt-0.5 text-[11px] text-zinc-400">
                      unique leads (by phone) · now {sel?.current?.totalLeads ?? "—"}
                    </div>
                  </label>
                  <label className="block sm:w-48">
                    <div className="text-sm font-medium mb-1">Filtered Leads</div>
                    <input
                      inputMode="numeric"
                      value={row.values.filteredLeads ?? ""}
                      onChange={(e) => setVal(idx, "filteredLeads", e.target.value)}
                      disabled={row.applied}
                      placeholder="—"
                      className={inputCls + " w-full tabular-nums"}
                    />
                    <div className="mt-0.5 text-[11px] text-zinc-400">
                      quality after CS filter · now {sel?.current?.filteredLeads ?? "—"}
                    </div>
                  </label>
                </div>
              </div>

              {/* Remarks — free-text notes about this specific live. */}
              <div className={SECTION}>
                <div className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Remarks
                </div>
                <textarea
                  value={row.remarks}
                  onChange={(e) =>
                    patchRow(idx, { remarks: e.target.value, applied: false, msg: null })
                  }
                  disabled={row.applied}
                  rows={2}
                  placeholder="Add any notes about this live…"
                  className={inputCls + " w-full resize-y"}
                />
              </div>

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
              )}
            </div>
          );
        })}
    </div>
  );
}

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-[13px] text-zinc-900 dark:text-zinc-100";
const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
const btnDone =
  "inline-flex items-center rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-70";
