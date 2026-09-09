"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AUTO_COLUMNS, MANUAL_COLUMNS } from "@/lib/tiktok-live/screenshot-extract-core";
import { ProductPicker } from "@/components/product-picker";
import { Disclosure } from "@/components/mobile/disclosure";
import { NumberField } from "@/components/mobile/number-field";
import { StickyAction } from "@/components/mobile/sticky-action";

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

// The two lead counts are the reason anyone backfills a live at all, so they
// come out of the general grid and sit on their own, above the collapsibles.
const BACKEND_COLUMNS = MANUAL_COLUMNS.filter(
  (c) => c !== "totalLeads" && c !== "filteredLeads"
);

/**
 * 48px on a phone, and back to today's ~34px box from `lg` up. `h-12` alone
 * would grow the desktop identity row by half again for no reason, and
 * `text-base` alone would leave the phone at 14px — which is the size iOS
 * Safari zooms the whole viewport for, on every one of these fields in turn.
 */
const FIELD =
  "h-12 w-full rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50 sm:text-sm lg:h-auto lg:px-2.5 lg:py-1.5 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

/**
 * Record a PAST live the tracker missed (e.g. it was down 3–6 Jul). Creates a
 * new session from the date/time/duration in the streamer's TikTok LIVE history,
 * plus whatever numbers they have. After saving it shows up in the normal list.
 */
export function AddPastLive({
  accounts,
  alwaysOpen = false,
  sticky = true,
}: {
  accounts: { id: string; handle: string }[];
  /**
   * Drop the component's own collapsed trigger. Set on `?mode=manual`, where a
   * `Disclosure` already provides the "Add a live that's missing" header — two
   * nested collapses with the same label is two taps to reach one form, and the
   * second one looks like the first one failed.
   */
  alwaysOpen?: boolean;
  /**
   * Rule SA-1: one docked Save bar per route. On `?mode=manual` the route's bar
   * belongs to `ManualEntryForm`, so this form ends with a plain full-width
   * button instead of a second bar pinned to the same 48px of screen.
   */
  sticky?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  // Read TikTok analytics screenshots with AI vision and auto-fill the form —
  // date, start time, duration + every visible number. The streamer then only
  // adds Total Leads + Filtered Leads (which are never on a screenshot).
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
      setMsg("Screenshots read ✓ — check the date, then add your lead counts.");
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
      router.refresh();
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

  if (!alwaysOpen && !open) {
    return (
      // One button, two shapes. Below `lg` it is the legacy page's third
      // chooser card — full width, 72px, the same box as the two links above
      // it. From `lg` up every `lg:` utility here hands it back to the inline
      // bordered button it renders on main today.
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-18 w-full items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-[17px] font-semibold text-zinc-900 shadow-sm active:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 lg:inline-flex lg:min-h-0 lg:w-auto lg:justify-start lg:rounded-md lg:border-zinc-300 lg:bg-transparent lg:px-3 lg:py-2 lg:text-sm lg:font-medium lg:shadow-none lg:hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:active:bg-zinc-800 lg:dark:border-zinc-700 lg:dark:bg-transparent lg:dark:hover:bg-zinc-800"
      >
        <span>➕ Add a live that&apos;s missing</span>
        <span aria-hidden="true" className="shrink-0 text-zinc-400 lg:hidden">
          →
        </span>
      </button>
    );
  }

  // Only errors reach the Save bar: the one success message this form produces
  // before saving ("screenshots read ✓") belongs beside the fields it just
  // filled, not pinned to the bottom of the screen 16 boxes away from them.
  const status = err;

  return (
    <div
      className={
        alwaysOpen
          ? "space-y-4"
          : "space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950"
      }
    >
      {!alwaysOpen && (
        <div>
          <h3 className="text-[17px] font-semibold">Add a past live</h3>
        </div>
      )}

      {doneId ? (
        <div className="space-y-3">
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm leading-relaxed text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            {msg}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <a
              href={`/tiktok-live/${doneId}`}
              className="flex h-12 items-center justify-center rounded-xl bg-blue-600 px-5 text-base font-medium text-white active:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:h-auto sm:py-2 sm:text-sm"
            >
              Open this live →
            </a>
            <button
              onClick={resetForNext}
              className="flex h-12 items-center justify-center rounded-xl border border-zinc-300 px-5 text-base font-medium text-zinc-700 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:h-auto sm:py-2 sm:text-sm dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800"
            >
              Add another
            </button>
            {!alwaysOpen && (
              <button
                onClick={() => {
                  setOpen(false);
                  resetForNext();
                }}
                className="flex min-h-11 items-center justify-center px-2 text-sm text-zinc-500 hover:underline"
              >
                Done
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Optional shortcut: read the date/time and every visible number off
              the TikTok Studio photos, so the sixteen boxes below start filled.
              A whole-box label rather than a bare file input — the native one is
              a ~30px control whose tap target is the word "Browse". */}
          <div>
            <label className="flex min-h-24 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-center active:bg-zinc-100 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:active:bg-zinc-900">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {files.length
                  ? `${files.length} screenshot${files.length === 1 ? "" : "s"} chosen`
                  : "Add screenshots to fill this in"}
              </span>
              <span className="text-xs text-zinc-500">Optional</span>
              <input
                type="file"
                multiple
                // `image/*` rather than the three explicit types: on iOS and
                // Android it is what turns the picker into "Camera / Photos"
                // instead of a file browser, and a streamer's screenshots are
                // in the camera roll.
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
                className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-medium text-white active:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 sm:h-auto sm:w-auto sm:py-2 sm:text-sm"
              >
                {reading ? "Reading…" : `Read ${files.length} screenshot${files.length === 1 ? "" : "s"}`}
              </button>
            )}
          </div>

          {msg && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm leading-relaxed text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              {msg}
            </div>
          )}

          {/* Identity: handle + date + time + duration. One column on a phone —
              a 375px row of four is where the date box loses its own digits. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3 md:grid-cols-4">
            {accounts.length > 1 && (
              <label className="block sm:col-span-2 md:col-span-1">
                <div className="text-xs font-medium mb-1">Handle</div>
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
            <label className="block">
              <div className="text-xs font-medium mb-1">Date</div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={busy}
                className={FIELD}
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium mb-1">Start time</div>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={busy}
                className={FIELD}
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium mb-1">Duration (min)</div>
              <input
                inputMode="numeric"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="e.g. 50"
                disabled={busy}
                className={`${FIELD} tabular-nums`}
              />
            </label>
          </div>

          {/* Your results — the two numbers no screenshot ever carries, so they
              are the two that have to be visible without opening anything. */}
          <div>
            <div className="mb-2.5 text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Your results
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
              <NumberField
                col="totalLeads"
                label="Total Leads"
                value={values.totalLeads ?? ""}
                disabled={busy}
                onChange={setVal}
              />
              <NumberField
                col="filteredLeads"
                label="Filtered Leads"
                value={values.filteredLeads ?? ""}
                disabled={busy}
                onChange={setVal}
              />
            </div>
          </div>

          <Disclosure title="Live performance" count="7 numbers" headingLevel={3}>
            <FieldGrid cols={AUTO_COLUMNS} values={values} disabled={busy} onChange={setVal} />
          </Disclosure>

          <Disclosure title="TikTok backend" count="7 numbers" headingLevel={3}>
            <FieldGrid cols={BACKEND_COLUMNS} values={values} disabled={busy} onChange={setVal} />
          </Disclosure>

          <div>
            <div className="mb-2 text-xs font-medium">Product / service</div>
            <ProductPicker value={products} onChange={setProducts} disabled={busy} />
          </div>

          {sticky ? (
            <StickyAction
              label={busy ? "Saving…" : "Add this live"}
              onClick={create}
              busy={busy}
              status={status}
              secondary={
                alwaysOpen
                  ? undefined
                  : {
                      label: "Cancel",
                      onClick: () => {
                        setOpen(false);
                        resetForNext();
                      },
                    }
              }
            />
          ) : (
            <div>
              {status && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`mb-2 text-sm leading-relaxed ${
                    err ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-300"
                  }`}
                >
                  {status}
                </p>
              )}
              <button
                onClick={create}
                disabled={busy}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-base font-medium text-white active:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 sm:h-auto sm:w-auto sm:py-2 sm:text-sm"
              >
                {busy ? "Saving…" : "Add this live"}
              </button>
            </div>
          )}
        </>
      )}
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3 md:grid-cols-4">
      {cols.map((c) => (
        <NumberField
          key={c}
          col={c}
          label={LABELS[c] ?? c}
          value={values[c] ?? ""}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
    </div>
  );
}
