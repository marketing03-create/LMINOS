"use client";

import { refreshEverywhere } from "@/app/actions/refresh-everywhere";
import { useState } from "react";
import { AUTO_COLUMNS, MANUAL_COLUMNS } from "@/lib/tiktok-live/screenshot-extract-core";
import {
  AUTO_FIELDS,
  FIELD_LABEL,
  REQUIRED_FIELDS,
  STUDIO_FIELDS,
  filledCount,
} from "@/lib/tiktok-live/input-fields";
import { ProductPicker } from "@/components/product-picker";
import { NumberField } from "@/components/mobile/number-field";
import { StickyAction } from "@/components/mobile/sticky-action";
import { FormSection } from "@/components/mobile/form-section";

/**
 * 48px on a phone, 40px from `lg` up — the same heights as `NumberField` with
 * the `lg:h-10` the input forms pass it, so a row of mixed boxes lines up.
 */
const FIELD =
  "h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50 sm:text-sm lg:h-10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

const LABEL = "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-200";

/**
 * Record a PAST live the tracker missed. Creates a new session from the
 * date/time/duration in the streamer's TikTok LIVE history, plus whatever
 * numbers they have — in the same numbered sections as "Type in": 1 Live
 * details (with an optional screenshot read to fill the form), 2 Required,
 * 3 TikTok Studio, 4 Live performance, 5 Product.
 */
export function AddPastLive({ accounts }: { accounts: { id: string; handle: string }[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [products, setProducts] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  function setVal(col: string, raw: string) {
    setValues((prev) => ({ ...prev, [col]: raw }));
    setErr(null);
  }

  // Read TikTok analytics screenshots with AI vision and fill the form — date,
  // start time, duration + every visible number. Total PM and Document Collect
  // are never on a screenshot, so they stay for the streamer to type.
  async function readScreenshots() {
    if (!files.length) return;
    setReading(true);
    setErr(null);
    setMsg(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("images", f));
      const res = await fetch("/api/tiktok-live/sessions/screenshots", {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setErr(json.error ?? `Couldn't read the screenshots (${res.status}).`);
        return;
      }
      const groups = (json.groups ?? []) as Array<{
        date: string | null;
        startTime: string | null;
        durationMinutes: number | null;
        values: Record<string, number>;
      }>;
      // Prefer a group that carries a date; else the first with any numbers.
      const g =
        groups.find((x) => x.date) ??
        groups.find((x) => Object.keys(x.values ?? {}).length > 0) ??
        groups[0];
      if (!g) {
        setErr("No numbers could be read from those images.");
        return;
      }
      if (g.date) setDate(g.date);
      if (g.startTime) setStartTime(g.startTime);
      if (g.durationMinutes != null) setDurationMinutes(String(g.durationMinutes));
      const filled: Record<string, string> = {};
      for (const [k, v] of Object.entries(g.values ?? {})) filled[k] = String(v);
      setValues((prev) => ({ ...prev, ...filled }));
      setMsg("Screenshots read ✓");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  }

  async function create() {
    if (!accountId) return setErr("Pick a handle.");
    if (!date) return setErr("Pick the date of the live.");
    if (!startTime) return setErr("Enter the start time.");
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const numeric: Record<string, number> = {};
      for (const col of [...AUTO_COLUMNS, ...MANUAL_COLUMNS]) {
        const raw = (values[col] ?? "").trim();
        if (raw === "") continue;
        numeric[col] = Math.max(0, Math.round(Number(raw) || 0));
      }
      const res = await fetch("/api/tiktok-live/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          date,
          startTime,
          durationMinutes: Number(durationMinutes) || 0,
          products,
          values: numeric,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setErr(json.error ?? `Failed (${res.status}).`);
        return;
      }
      setDoneId(json.id ?? null);
      setMsg("Saved ✓ — this live is now in your list.");
      void refreshEverywhere();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function resetForNext() {
    setDate("");
    setStartTime("");
    setDurationMinutes("");
    setProducts([]);
    setValues({});
    setFiles([]);
    setMsg(null);
    setErr(null);
    setDoneId(null);
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-[15px] font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
        No TikTok handle assigned to you yet
      </div>
    );
  }

  if (doneId) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="text-[15px] font-semibold text-emerald-900 dark:text-emerald-200">{msg}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
          <a
            href={`/tiktok-live/${doneId}`}
            className="flex h-12 items-center justify-center rounded-xl bg-blue-600 px-5 text-base font-medium text-white active:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:h-10 sm:text-sm"
          >
            Open this live
          </a>
          <button
            onClick={resetForNext}
            className="flex h-12 items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 text-base font-medium text-zinc-700 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:h-10 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:active:bg-zinc-800"
          >
            Add another
          </button>
        </div>
      </div>
    );
  }

  const detailsFilled = [date, startTime, durationMinutes].filter((v) => v.trim() !== "").length;

  return (
    <div className="space-y-4">
      <FormSection step={1} title="Live details" filled={detailsFilled} total={3} required>
        {/* Optional: read the date/time and every visible number off the TikTok
            Studio photos, so the boxes below start filled. A whole-box label,
            not the ~30px native file input. */}
        <label className="flex min-h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-center text-sm font-medium text-zinc-700 active:bg-zinc-100 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-200 dark:active:bg-zinc-900">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {files.length
            ? `${files.length} screenshot${files.length === 1 ? "" : "s"} chosen`
            : "Fill from screenshots (optional)"}
          <input
            type="file"
            multiple
            // `image/*` turns the phone picker into "Camera / Photos".
            accept="image/*"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            disabled={busy || reading}
            className="sr-only"
          />
        </label>
        {files.length > 0 && (
          <button
            onClick={readScreenshots}
            disabled={reading || busy}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white active:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
          >
            {reading ? "Reading…" : `Read ${files.length} screenshot${files.length === 1 ? "" : "s"}`}
          </button>
        )}
        {msg && (
          <p role="status" className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {msg}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {accounts.length > 1 && (
            <label className="col-span-2 block lg:col-span-1">
              <span className={LABEL}>Handle</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                disabled={busy}
                className={FIELD}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.handle}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="col-span-2 block lg:col-span-1">
            <span className={LABEL}>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={busy}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Start time</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={busy}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Duration (min)</span>
            <input
              inputMode="numeric"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="50"
              disabled={busy}
              className={`${FIELD} text-right tabular-nums`}
            />
          </label>
        </div>
      </FormSection>

      <FormSection
        step={2}
        title="Required results"
        filled={filledCount(REQUIRED_FIELDS, values)}
        total={REQUIRED_FIELDS.length}
        required
      >
        <FieldGrid cols={REQUIRED_FIELDS} values={values} disabled={busy} onChange={setVal} />
      </FormSection>

      <FormSection
        step={3}
        title="TikTok Studio"
        filled={filledCount(STUDIO_FIELDS, values)}
        total={STUDIO_FIELDS.length}
        collapsible
      >
        <FieldGrid cols={STUDIO_FIELDS} values={values} disabled={busy} onChange={setVal} />
      </FormSection>

      <FormSection
        step={4}
        title="Live performance"
        filled={filledCount(AUTO_FIELDS, values)}
        total={AUTO_FIELDS.length}
        collapsible
      >
        <FieldGrid cols={AUTO_FIELDS} values={values} disabled={busy} onChange={setVal} />
      </FormSection>

      <FormSection step={5} title="Product / service">
        <ProductPicker value={products} onChange={setProducts} disabled={busy} />
      </FormSection>

      <StickyAction
        label={busy ? "Saving…" : "Add this live"}
        onClick={create}
        busy={busy}
        status={err}
      />
    </div>
  );
}

function FieldGrid({
  cols,
  values,
  disabled,
  onChange,
}: {
  cols: readonly string[];
  values: Record<string, string>;
  disabled: boolean;
  onChange: (col: string, v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-4 lg:grid-cols-3">
      {cols.map((c) => (
        <NumberField
          key={c}
          col={c}
          label={FIELD_LABEL[c] ?? c}
          value={values[c] ?? ""}
          disabled={disabled}
          onChange={onChange}
          inputClassName="lg:h-10"
        />
      ))}
    </div>
  );
}
