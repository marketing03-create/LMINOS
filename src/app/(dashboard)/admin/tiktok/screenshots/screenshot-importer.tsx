"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AUTO_COLUMNS } from "@/lib/tiktok-live/screenshot-extract-core";
import { ProductPicker } from "@/components/product-picker";
import { LivePicker } from "@/components/live-picker";
import { Sheet } from "@/components/mobile/sheet";
import { Disclosure } from "@/components/mobile/disclosure";
import { NumberField } from "@/components/mobile/number-field";
import { StickyAction } from "@/components/mobile/sticky-action";
import { RecordCard } from "@/components/mobile/record-card";
import { NoticeStrip } from "@/components/mobile/notice-strip";
import { HelpChip } from "@/components/mobile/metric-help-sheet";
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

/**
 * Conflict strings come out of `mergeExtractions` keyed by raw column name —
 * `avgWatchSeconds: 412 vs 380 (kept first)`. That is the right key for a log
 * and the wrong word for a person, so the leading key is swapped for the label
 * the same field carries everywhere else on this screen. The rest of the
 * sentence, including which value was kept, is left exactly as written.
 */
function labelConflict(c: string): string {
  const m = /^([A-Za-z][A-Za-z0-9]*):/.exec(c);
  if (!m) return c;
  const label = LABELS[m[1]];
  return label ? `${label}${c.slice(m[1].length)}` : c;
}

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

// Each block sits in its own ELEVATED card — a solid surface a shade lighter
// than the page (white / zinc-900) with a soft shadow — so the sections clearly
// stand out as distinct steps (per the reference layout).
const SECTION =
  "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

// Shrink a screenshot in the browser BEFORE uploading. Claude's vision resizes
// anything over ~1568px on the long edge server-side anyway, so sending a full
// phone screenshot (2–3 MB) just wastes upload time — worst on mobile, which is
// exactly where streamers upload from after a live. We cap the long edge and
// re-encode as JPEG. Falls back to the original file on any error / if the
// re-encode wouldn't actually be smaller (readability is unchanged either way).
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

/**
 * How long the "Applied ✓" state stays on screen before we open the live so the
 * numbers can be checked. FROZEN at 1500ms (contract 14) — the delay is what
 * makes the confirmation readable, and shortening or lengthening it changes a
 * behaviour other people have learned. What is NOT frozen is that it used to be
 * unstoppable: a batch of four screenshots would apply one and then navigate
 * away from the other three, silently abandoning them. Hence the countdown and
 * the Stay-here escape below.
 */
const REDIRECT_MS = 1500;

const ACCEPT = "image/png,image/jpeg,image/webp";

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
  /**
   * The phone's half of the same "one at a time" rule, deliberately NOT the
   * same state as `expandedKey`. `read()` opens the first group as soon as the
   * numbers come back, which is right for the inline desktop panel and would be
   * a full-screen sheet slamming shut over the batch on a phone. So the sheet
   * only ever opens from a tap, and starts closed.
   */
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [redirect, setRedirect] = useState<{ sid: string; msLeft: number } | null>(
    null
  );
  const redirectTimer = useRef<number | null>(null);

  /**
   * Thumbnails for the picked files. Built in a memo rather than an effect
   * because setting state from an effect body is a lint error in this repo, and
   * because the URLs must exist on the same render as the files they belong to
   * — a strip that appears one frame late reads as the picker having dropped
   * the photo. The effect below is only the cleanup half.
   */
  const previews = useMemo(
    () => files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })),
    [files]
  );
  useEffect(
    () => () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    },
    [previews]
  );

  // Tick the visible countdown. Half-second steps, because 1.5s cannot be
  // counted honestly in whole ones and a number that jumps 2 → 1 → gone reads
  // as a bug in the very moment we are asking someone to trust the save.
  const counting = redirect !== null;
  useEffect(() => {
    if (!counting) return;
    const id = window.setInterval(() => {
      setRedirect((r) => (r ? { ...r, msLeft: Math.max(0, r.msLeft - 500) } : r));
    }, 500);
    return () => window.clearInterval(id);
  }, [counting]);

  // A pending navigation must not outlive the component — leaving this page
  // some other way and then being yanked to a live 1.5s later is the same bug
  // in a different costume.
  useEffect(
    () => () => {
      if (redirectTimer.current != null) window.clearTimeout(redirectTimer.current);
    },
    []
  );

  const stayHere = useCallback(() => {
    if (redirectTimer.current != null) window.clearTimeout(redirectTimer.current);
    redirectTimer.current = null;
    setRedirect(null);
  }, []);

  const closeSheet = useCallback(() => setSheetKey(null), []);

  // The sheet is the phone rendering of a panel that expands inline at `lg`.
  // Widen the window with one open and it would sit over a layout that has its
  // own copy of the same form. Same breakpoint the cards are hidden at, in the
  // same unit Tailwind writes it in.
  useEffect(() => {
    if (sheetKey == null) return;
    const mq = window.matchMedia("(min-width: 64rem)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setSheetKey(null);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [sheetKey]);

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
      patchRow(idx, { applied: true, msg: "Applied ✓" });
      // Close the review sheet so the card underneath can show its Applied ✓,
      // and hand the countdown bar the navigation.
      setSheetKey(null);
      // Green for a beat, then open this live's detail page to check the metrics.
      const sid = row.selectedSessionId;
      // Applying a second group inside the 1.5s window would otherwise leave
      // the first timer pending and land on the FIRST live, not this one.
      if (redirectTimer.current != null) window.clearTimeout(redirectTimer.current);
      setRedirect({ sid, msLeft: REDIRECT_MS });
      redirectTimer.current = window.setTimeout(
        () => router.push(`/tiktok-live/${sid}`),
        REDIRECT_MS
      );
    } catch (e) {
      patchRow(idx, { msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      {/* ── The escape from the frozen redirect (fix F5) ────────────────────
          Pinned, because by the time this appears the review sheet has closed
          and the reader may be anywhere in a stack of four groups. A banner at
          the top of the component would be off-screen for the whole 1.5s it is
          offering to be cancelled, which is the same as not offering.

          It sits OUTSIDE the `space-y-6` list below on purpose: a `space-y-*`
          rule adds a top margin to every child but the first, so a bar that
          appears at the head of that list would shove the whole page down by
          24px for the duration of the countdown — a layout jump at the exact
          moment we are asking someone to read a number and decide. */}
      {redirect && (
        <div
          className="fixed inset-x-0 z-40 px-4"
          style={{
            bottom:
              "calc(env(safe-area-inset-bottom, 0px) + var(--lmiros-bottom-bar, 0px) + 0.5rem)",
          }}
        >
          <div className="mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 shadow-lg dark:border-emerald-800 dark:bg-emerald-950">
            {/* The ticking half is `aria-hidden`, and the announced half is a
                sentence that does not change. A live region holding the
                countdown re-announces on every 500ms tick, so a screen-reader
                user gets "opening this live in 1.5 seconds… 1.0 seconds…"
                talking over the Stay-here button during the 1.5s they have to
                press it. Say it once, and name the escape. */}
            <p
              role="status"
              aria-live="polite"
              className="min-w-0 flex-1 text-sm leading-relaxed text-emerald-900 dark:text-emerald-300"
            >
              <span className="sr-only">
                Applied. Opening this live shortly — choose Stay here to cancel.
              </span>
              <span aria-hidden="true">
                Applied ✓ — opening this live in{" "}
                <span className="tabular-nums">
                  {(redirect.msLeft / 1000).toFixed(1)}s
                </span>
              </span>
            </p>
            <button
              type="button"
              onClick={stayHere}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-emerald-400 px-4 text-sm font-medium text-emerald-900 active:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-emerald-700 dark:text-emerald-200 dark:active:bg-emerald-900"
            >
              Stay here
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
      {/* ── Phone: a hero dropzone ──────────────────────────────────────────
          The native file input squeezed beside a shrink-0 "Read (N)" button
          gave the actual target about 180px of a 375px screen, at 14px, with
          the OS filename string eating whatever was left. A full-width 160px
          label is one thumb-sized thing to hit, and it is what makes the
          camera a first-class option after a live. */}
      <div className="lg:hidden">
        <label className="flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 bg-white px-4 text-center active:bg-zinc-50 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/40 dark:border-zinc-700 dark:bg-zinc-950 dark:active:bg-zinc-900">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
          <span className="text-base font-medium">Add your LIVE screenshots</span>
          <input
            type="file"
            multiple
            accept={ACCEPT}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="sr-only"
          />
        </label>

        {previews.length > 0 && (
          <>
            <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {previews.map((p, i) => (
                <li key={p.url} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.name}
                    className="h-16 w-16 rounded-lg border border-zinc-200 object-cover dark:border-zinc-800"
                  />
                  {/* Drawn small so it does not swallow the 64px thumbnail it
                      sits on, but the pressable area is 48px via hit-slop — a
                      pseudo-element, so it adds no layout box and cannot push
                      the strip around (§P2). */}
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                    aria-label={`Remove ${p.name}`}
                    className="absolute right-0.5 top-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs leading-none text-white active:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 before:absolute before:-inset-3 before:content-['']"
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={read}
              disabled={reading}
              className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-base font-medium text-white active:bg-blue-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              {reading
                ? "Reading…"
                : `Read ${previews.length} photo${previews.length === 1 ? "" : "s"}`}
            </button>
          </>
        )}
      </div>

      {/* ── Laptop: today's upload row, unchanged ───────────────────────────── */}
      <div className="hidden rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-4 lg:block dark:border-zinc-700 dark:bg-zinc-950">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium">Add your LIVE screenshots</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            multiple
            accept={ACCEPT}
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

          const heading = g.date
            ? `Live on ${g.date}${g.startTime ? ` · ${g.startTime}` : ""}`
            : "Undated screenshot";
          const status: { label: string; tone: "amber" | "emerald" | "zinc" } =
            row.applied
              ? { label: "Applied ✓", tone: "emerald" }
              : !row.selectedSessionId
                ? { label: "Pick a live", tone: "amber" }
                : g.conflicts.length > 0
                  ? {
                      label: `${g.conflicts.length} conflict${
                        g.conflicts.length === 1 ? "" : "s"
                      }`,
                      tone: "amber",
                    }
                  : { label: "Matched", tone: "zinc" };

          const numField = (c: string, autoFocus?: boolean) => (
            <NumberField
              key={c}
              col={c}
              label={LABELS[c] ?? c}
              value={String(row.values[c] ?? "")}
              current={sel?.current?.[c] ?? null}
              pending={row.values[c] ?? null}
              onChange={(col, v) => setVal(idx, col, v)}
              disabled={row.applied}
              autoFocus={autoFocus}
            />
          );

          return (
            <div key={g.key}>
              {/* ── Phone: a summary card that opens a full-height review ──── */}
              <div className="lg:hidden">
                <RecordCard
                  onClick={() => setSheetKey(g.key)}
                  tone={
                    row.applied
                      ? "good"
                      : !row.selectedSessionId || g.conflicts.length > 0
                        ? "warn"
                        : "neutral"
                  }
                  status={status}
                  title={heading}
                  meta={
                    <>
                      {g.handle ? `@${g.handle} · ` : ""}
                      {cols.length} number{cols.length === 1 ? "" : "s"} read
                    </>
                  }
                />

                <Sheet
                  open={sheetKey === g.key}
                  onClose={closeSheet}
                  title={heading}
                  fullHeight
                  footer={
                    /* -mt-3 lands StickyAction's own top border exactly on the
                       Sheet footer's, instead of drawing a second hairline
                       12px below the first. */
                    <div className="-mt-3">
                      <StickyAction
                        label={row.applied ? "Applied ✓" : "Apply to this live"}
                        onClick={() => apply(idx, g)}
                        busy={busyKey === g.key}
                        disabled={row.applied}
                        status={row.msg}
                      />
                    </div>
                  }
                >
                  <div className="space-y-5 pb-2">
                    {g.conflicts.length > 0 && (
                      <NoticeStrip
                        items={g.conflicts.map((c, i) => ({
                          key: `${g.key}-conflict-${i}`,
                          short: labelConflict(c),
                          tone: "amber" as const,
                        }))}
                      />
                    )}

                    <div>
                      <div className="mb-2 text-sm font-medium">Apply to live</div>
                      <LivePicker
                        lives={review.sessions}
                        value={row.selectedSessionId}
                        onChange={(sid) => {
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

                    <div>
                      <div className="mb-2 text-sm font-medium">Products</div>
                      <ProductPicker
                        value={row.selectedProducts}
                        onChange={(next) =>
                          patchRow(idx, {
                            selectedProducts: next,
                            applied: false,
                            msg: null,
                          })
                        }
                        disabled={row.applied}
                      />
                    </div>

                    {/* Leads first, and above both disclosures. They are the two
                        numbers no screenshot can ever carry, so they are the
                        only reason this form needs a human — everything else is
                        a correction to something already read. */}
                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[17px] font-semibold">Your results</span>
                        <HelpChip keys={["totalLeads", "filteredLeads"]} />
                      </div>
                      <div className="space-y-3">
                        {numField("totalLeads")}
                        {numField("filteredLeads")}
                      </div>
                    </div>

                    {autoCols.length > 0 && (
                      <div className="-mx-4 border-t border-zinc-100 dark:border-zinc-800">
                        <Disclosure
                          title="Captured numbers"
                          count={`${autoCols.length}`}
                        >
                          <div className="space-y-3">
                            {autoCols.map((c) => numField(c))}
                          </div>
                        </Disclosure>
                      </div>
                    )}

                    {manualCols.length > 0 && (
                      <div className="-mx-4 border-t border-zinc-100 dark:border-zinc-800">
                        <Disclosure
                          title="TikTok backend"
                          count={`${manualCols.length}`}
                        >
                          <div className="space-y-3">
                            {manualCols.map((c) => numField(c))}
                          </div>
                        </Disclosure>
                      </div>
                    )}

                    <div>
                      <label
                        className="mb-2 block text-sm font-medium"
                        htmlFor={`remarks-${g.key}`}
                      >
                        Remarks
                      </label>
                      <textarea
                        id={`remarks-${g.key}`}
                        value={row.remarks}
                        onChange={(e) =>
                          patchRow(idx, {
                            remarks: e.target.value,
                            applied: false,
                            msg: null,
                          })
                        }
                        disabled={row.applied}
                        rows={3}
                        placeholder="Add any notes about this live…"
                        className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </div>
                  </div>
                </Sheet>
              </div>

              {/* ── Laptop: today's inline expander, unchanged ─────────────── */}
              <div
                className={`hidden border rounded-xl bg-white lg:block dark:bg-zinc-950 ${
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
                    {g.date ? `Live on ${g.date}` : "Undated screenshot"}
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
                  {g.conflicts.map(labelConflict).join(" · ")}
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
                  <div className="text-xs font-medium mb-1">Products</div>
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
                    Captured numbers
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
                    TikTok backend
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
                  Your results
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
                      now {sel?.current?.totalLeads ?? "—"}
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
                      now {sel?.current?.filteredLeads ?? "—"}
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
            </div>
          );
        })}
      </div>
    </>
  );
}

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-[13px] text-zinc-900 dark:text-zinc-100";
const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
const btnDone =
  "inline-flex items-center rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-70";
