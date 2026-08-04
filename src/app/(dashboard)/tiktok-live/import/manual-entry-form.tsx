"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AUTO_COLUMNS, MANUAL_COLUMNS } from "@/lib/tiktok-live/screenshot-extract-core";
import { ProductPicker } from "@/components/product-picker";
import { LivePicker } from "@/components/live-picker";
import type { MatchCandidate } from "@/lib/tiktok-live/queries";

const sameProducts = (a: string[], b: string[]) =>
  [...a].sort().join("|") === [...b].sort().join("|");

// The lead counts get their own prominent "Your results" section at the top, so
// exclude them from the general extras grid (apply() still reads them from the
// same values map, so nothing changes in what gets saved).
const EXTRA_COLUMNS = MANUAL_COLUMNS.filter(
  (c) => c !== "totalLeads" && c !== "filteredLeads"
);

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
 * Type-the-numbers form on the streamer upload page. This is the MAIN way to
 * record a live's TikTok-backend numbers — the screenshot reader below is just a
 * shortcut. Pick your live, type what TikTok Studio shows, tag the product, and
 * save. Writes through the same routes the screenshot import uses (product via
 * the session PATCH, numbers via apply-screenshot), so the Views/Likes lock and
 * audit trail are identical.
 */
export function ManualEntryForm({ sessions }: { sessions: MatchCandidate[] }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState("");
  const [products, setProducts] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Auto-captured numbers are filled by the bot; hidden by default so the form
  // stays short — the streamer only expands them to fix a wrong value.
  const [showCaptured, setShowCaptured] = useState(false);

  const selected = sessions.find((s) => s.sessionId === sessionId);

  function pickSession(id: string) {
    setSessionId(id);
    setApplied(false);
    setMsg(null);
    const s = sessions.find((x) => x.sessionId === id);
    setProducts(s?.products ?? []);
    setRemarks(s?.remarks ?? "");
    // Pre-fill each field from what's already saved on that live.
    const v: Record<string, string> = {};
    if (s) {
      for (const col of [...AUTO_COLUMNS, ...MANUAL_COLUMNS]) {
        const cur = s.current[col];
        v[col] = cur == null ? "" : String(cur);
      }
    }
    setValues(v);
  }

  function setVal(col: string, raw: string) {
    setValues((prev) => ({ ...prev, [col]: raw }));
    setApplied(false);
    setMsg(null);
  }

  async function apply() {
    if (!sessionId || !selected) {
      setMsg("Pick a live first.");
      return;
    }
    // Only send fields that actually changed (AUTO can't be blank → skip blanks;
    // MANUAL may be cleared to null).
    const payload: Record<string, number | null> = {};
    for (const col of AUTO_COLUMNS) {
      const raw = (values[col] ?? "").trim();
      if (raw === "") continue;
      const n = Math.max(0, Math.round(Number(raw) || 0));
      const cur = selected.current[col];
      if (cur != null && Number(cur) === n) continue;
      payload[col] = n;
    }
    for (const col of MANUAL_COLUMNS) {
      const raw = (values[col] ?? "").trim();
      const next = raw === "" ? null : Math.max(0, Math.round(Number(raw) || 0));
      const cur = selected.current[col] ?? null;
      if ((cur == null ? null : Number(cur)) === next) continue;
      payload[col] = next;
    }
    const productChanged = !sameProducts(products, selected.products ?? []);
    const remarksChanged = remarks.trim() !== (selected.remarks ?? "").trim();
    const hasNumbers = Object.keys(payload).length > 0;
    if (!hasNumbers && !productChanged && !remarksChanged) {
      setMsg("Nothing changed to save.");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      // Product tag + remarks (session PATCH — saves even when no number changed).
      if (productChanged || remarksChanged) {
        const patchBody: Record<string, unknown> = {};
        if (productChanged) patchBody.products = products;
        if (remarksChanged) patchBody.remarks = remarks.trim() === "" ? null : remarks.trim();
        const pRes = await fetch(`/api/tiktok-live/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        const pj = await pRes.json().catch(() => ({}));
        if (!pRes.ok || pj.ok === false) {
          setMsg(pj.error ?? `Save failed (${pRes.status}).`);
          setBusy(false);
          return;
        }
      }
      // The numbers.
      if (hasNumbers) {
        const res = await fetch(
          `/api/tiktok-live/sessions/${sessionId}/apply-screenshot`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ values: payload }),
          }
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.ok === false) {
          setMsg(j.error ?? `Failed (${res.status}).`);
          setBusy(false);
          return;
        }
      }
      setApplied(true);
      setMsg("Saved ✓ — opening your live…");
      // Green for a beat, then jump to this live's row on the list page and
      // refetch it, so the just-saved numbers show instead of a cached feed.
      setTimeout(() => {
        router.push(`/tiktok-live#session-${sessionId}`);
        router.refresh();
      }, 2000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {sessions.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No lives yet. Once you go live and it&apos;s captured, it&apos;ll show
          up here to fill in.
        </p>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="block flex-1">
              <div className="text-xs font-medium mb-1">Which live</div>
              <LivePicker
                lives={sessions}
                value={sessionId}
                onChange={pickSession}
                disabled={busy || applied}
              />
            </div>

            <div className="block sm:w-auto">
              <div className="text-xs font-medium mb-1">
                Product / service <span className="text-zinc-400">(tick all that apply)</span>
              </div>
              <ProductPicker
                value={products}
                onChange={(next) => {
                  setProducts(next);
                  setApplied(false);
                  setMsg(null);
                }}
                disabled={busy || applied || !sessionId}
              />
            </div>
          </div>

          {selected && (
            <>
              {/* Your results — the goal numbers, first and prominent. */}
              <div className={SECTION}>
                <div className="mb-2.5 text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Your results
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <LeadField
                    label="Total Leads"
                    col="totalLeads"
                    hint="unique leads (by phone)"
                    values={values}
                    current={selected.current}
                    disabled={busy || applied}
                    onChange={setVal}
                  />
                  <LeadField
                    label="Filtered Leads"
                    col="filteredLeads"
                    hint="quality after CS filter"
                    values={values}
                    current={selected.current}
                    disabled={busy || applied}
                    onChange={setVal}
                  />
                </div>
              </div>

              {/* Service panel — what the streamer reads off TikTok Studio. */}
              <div className={SECTION}>
                <FieldGrid
                  title="Service panel — you enter these"
                  cols={EXTRA_COLUMNS}
                  labels={LABELS}
                  values={values}
                  current={selected.current}
                  disabled={busy || applied}
                  onChange={setVal}
                />
              </div>

              {/* Remarks — free-text notes about this specific live. */}
              <div className={SECTION}>
                <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                  Remarks
                </div>
                <textarea
                  value={remarks}
                  onChange={(e) => {
                    setRemarks(e.target.value);
                    setApplied(false);
                    setMsg(null);
                  }}
                  disabled={busy || applied}
                  rows={3}
                  placeholder="Add any notes about this live — issues, highlights, follow-ups…"
                  className={inputCls + " w-full resize-y"}
                />
              </div>

              {/* Auto-captured — the bot fills these; collapsed unless a fix is needed. */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowCaptured((v) => !v)}
                  aria-expanded={showCaptured}
                  className="flex w-full items-center justify-between rounded-xl bg-zinc-100 px-4 py-3 text-left dark:bg-zinc-900"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      Auto-captured numbers
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      Views, likes, comments… tap to adjust
                    </span>
                  </span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className={`shrink-0 text-zinc-400 transition-transform ${
                      showCaptured ? "rotate-180" : ""
                    }`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {showCaptured && (
                  <div className="mt-3">
                    <FieldGrid
                      title="Captured numbers"
                      cols={AUTO_COLUMNS}
                      labels={LABELS}
                      values={values}
                      current={selected.current}
                      disabled={busy || applied}
                      onChange={setVal}
                    />
                  </div>
                )}
              </div>

              {/* Sticky Save — pinned just above the bottom nav on mobile. */}
              <div
                className="sticky z-30 -mx-4 border-t border-zinc-200 bg-white/95 px-4 pb-2 pt-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-1 sm:backdrop-blur-none sm:dark:bg-transparent"
                style={{ bottom: "calc(env(safe-area-inset-bottom) + 4rem)" }}
              >
                <button
                  onClick={apply}
                  disabled={busy || applied}
                  className={applied ? btnDone : btnPrimary}
                >
                  {applied ? "Saved ✓" : busy ? "Saving…" : "Save results"}
                </button>
                {msg && (
                  <p
                    className={
                      applied
                        ? "mt-2 text-center text-xs text-emerald-600 dark:text-emerald-400"
                        : "mt-2 text-center text-xs text-zinc-500"
                    }
                  >
                    {msg}
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function FieldGrid({
  title,
  cols,
  labels,
  values,
  current,
  disabled,
  onChange,
}: {
  title: string;
  cols: readonly string[];
  labels: Record<string, string>;
  values: Record<string, string>;
  current: Record<string, number | null>;
  disabled: boolean;
  onChange: (col: string, v: string) => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
        {title}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cols.map((c) => {
          const cur = current[c];
          const changed =
            (values[c] ?? "").trim() !== "" &&
            cur != null &&
            Number(values[c]) !== Number(cur);
          return (
            <label key={c} className="block">
              <div className="text-sm font-medium mb-1">{labels[c] ?? c}</div>
              <input
                inputMode="numeric"
                value={values[c] ?? ""}
                onChange={(e) => onChange(c, e.target.value)}
                disabled={disabled}
                className={inputCls + " w-full tabular-nums"}
              />
              <div className="mt-0.5 text-[11px] text-zinc-400">
                now {cur ?? "—"}
                {changed && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {" "}
                    → {Math.max(0, Math.round(Number(values[c]) || 0))}
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** Prominent lead-count field (bigger input) for the "Your results" section. */
function LeadField({
  label,
  col,
  hint,
  values,
  current,
  disabled,
  onChange,
}: {
  label: string;
  col: string;
  hint: string;
  values: Record<string, string>;
  current: Record<string, number | null>;
  disabled: boolean;
  onChange: (col: string, v: string) => void;
}) {
  const cur = current[col];
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium">{label}</div>
      <input
        inputMode="numeric"
        value={values[col] ?? ""}
        onChange={(e) => onChange(col, e.target.value)}
        disabled={disabled}
        placeholder="—"
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base tabular-nums text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
      <div className="mt-0.5 text-[11px] text-zinc-400">
        {hint} · now {cur ?? "—"}
      </div>
    </label>
  );
}

// Each block on the form sits in its own soft card, so the sections read as
// distinct steps (like the reference case-details layout) instead of one long list.
const SECTION =
  "rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50";
const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 disabled:opacity-50";
const btnPrimary =
  "inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50";
const btnDone =
  "inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-70";
