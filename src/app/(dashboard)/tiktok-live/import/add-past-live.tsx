"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AUTO_COLUMNS, MANUAL_COLUMNS } from "@/lib/tiktok-live/screenshot-extract-core";
import { ProductPicker } from "@/components/product-picker";

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

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 disabled:opacity-50";

/**
 * Record a PAST live the tracker missed (e.g. it was down 3–6 Jul). Creates a
 * new session from the date/time/duration in the streamer's TikTok LIVE history,
 * plus whatever numbers they have. After saving it shows up in the normal list.
 */
export function AddPastLive({ accounts }: { accounts: { id: string; handle: string }[] }) {
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
      setMsg("Screenshots read ✓ — check the date & numbers, then add Total Leads + Filtered Leads.");
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        ➕ Add a past live (not in the list)
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Add a past live</h3>
      </div>

      {doneId ? (
        <div className="space-y-3">
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            {msg}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={resetForNext} className={btnPrimary}>
              Add another past live
            </button>
            <a href={`/tiktok-live/${doneId}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Open this live →
            </a>
            <button onClick={() => { setOpen(false); resetForNext(); }} className="text-sm text-zinc-500 hover:underline">
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Read screenshots → auto-fill date/time + numbers (AI vision). */}
          <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 p-3 flex flex-wrap items-center gap-3">
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              disabled={busy || reading}
              className="text-sm text-zinc-500 file:mr-3 file:cursor-pointer file:rounded-md file:border-2 file:border-zinc-400 file:bg-zinc-200 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-800 hover:file:bg-zinc-300 dark:file:border-zinc-500 dark:file:bg-zinc-700 dark:file:text-zinc-100 dark:hover:file:bg-zinc-600"
            />
            <button
              onClick={readScreenshots}
              disabled={reading || busy || files.length === 0}
              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {reading ? "Reading…" : "Read screenshots"}
            </button>
          </div>

          {msg && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              {msg}
            </div>
          )}

          {/* Identity: handle + date + time + duration */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {accounts.length > 1 && (
              <label className="block col-span-2 md:col-span-1">
                <div className="text-xs font-medium mb-1">Handle</div>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  disabled={busy}
                  className={inputCls + " w-full"}
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
                className={inputCls + " w-full"}
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium mb-1">Start time</div>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={busy}
                className={inputCls + " w-full"}
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
                className={inputCls + " w-full tabular-nums"}
              />
            </label>
          </div>

          <FieldGrid title="Numbers" cols={AUTO_COLUMNS} values={values} disabled={busy} onChange={setVal} />
          <FieldGrid title="TikTok-only extras" cols={MANUAL_COLUMNS} values={values} disabled={busy} onChange={setVal} />

          <div>
            <div className="text-xs font-medium mb-1">
              Product / service <span className="text-zinc-400">(tick all that apply)</span>
            </div>
            <ProductPicker value={products} onChange={setProducts} disabled={busy} />
          </div>

          {err && <div className="text-xs text-red-600 dark:text-red-400">{err}</div>}

          <div className="flex items-center gap-3">
            <button onClick={create} disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : "Add this live"}
            </button>
            <button
              onClick={() => { setOpen(false); resetForNext(); }}
              disabled={busy}
              className="text-sm text-zinc-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FieldGrid({
  title,
  cols,
  values,
  disabled,
  onChange,
}: {
  title: string;
  cols: readonly string[];
  values: Record<string, string>;
  disabled: boolean;
  onChange: (col: string, v: string) => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">{title}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cols.map((c) => (
          <label key={c} className="block">
            <div className="text-xs font-medium mb-1">{LABELS[c] ?? c}</div>
            <input
              inputMode="numeric"
              value={values[c] ?? ""}
              onChange={(e) => onChange(c, e.target.value)}
              disabled={disabled}
              className={inputCls + " w-full tabular-nums"}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
