"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";

/**
 * The session's metrics card — EVERY number is editable. Grouped so the streamer
 * scans top-to-bottom against their TikTok screenshots and fixes any value, then
 * Saves once. Connector-captured numbers (Views/Likes/…) and the manual backend
 * numbers all write through the session PATCH route.
 */
type Field = { key: string; label: string; accent?: boolean; help?: string };

const LIVE_FIELDS: Field[] = [
  { key: "totalViews", label: "Views", help: METRIC_HELP.views },
  { key: "peakViewers", label: "Peak viewers", help: METRIC_HELP.peak },
  { key: "avgViewers", label: "Avg viewers", help: METRIC_HELP.avg },
  { key: "newFollowers", label: "New followers", help: METRIC_HELP.followers },
  { key: "totalLikes", label: "Likes", help: METRIC_HELP.likes },
  { key: "totalComments", label: "Comments", help: METRIC_HELP.comments },
  { key: "totalShares", label: "Shares", help: METRIC_HELP.shares },
  { key: "durationMinutes", label: "Duration (min)", help: METRIC_HELP.duration },
];

const BACKEND_FIELDS: Field[] = [
  { key: "uniqueViewers", label: "Unique viewers", help: METRIC_HELP.unique },
  { key: "activeViewers", label: "Active viewers", help: METRIC_HELP.active },
  { key: "avgWatchSeconds", label: "Avg watch (sec)", help: METRIC_HELP.watch },
  { key: "directMessages", label: "Direct messages", help: METRIC_HELP.dms },
  { key: "serviceBioViews", label: "Service bio views", help: METRIC_HELP.bioViews },
  { key: "interestedViewers", label: "Interested viewers", help: METRIC_HELP.interested },
  { key: "diamonds", label: "Diamonds", help: METRIC_HELP.diamonds },
];

const LEAD_FIELDS: Field[] = [
  { key: "totalLeads", label: "Total leads", accent: true, help: METRIC_HELP.totalLeads },
  { key: "filteredLeads", label: "Filtered leads", help: METRIC_HELP.filteredLeads },
];

// Admins additionally see/edit the auto keyword-comment count.
const ADMIN_LEAD_FIELDS: Field[] = [
  { key: "keywordLeads", label: "PM comments (keyword)", help: METRIC_HELP.commentLeads },
];

export function SessionMetricsCard({
  sessionId,
  isStreamer,
  initial,
}: {
  sessionId: string;
  isStreamer: boolean;
  initial: Record<string, number | null>;
}) {
  const router = useRouter();
  const leadFields = isStreamer ? LEAD_FIELDS : [...LEAD_FIELDS, ...ADMIN_LEAD_FIELDS];
  const allFields = [...LIVE_FIELDS, ...BACKEND_FIELDS, ...leadFields];

  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of allFields) o[f.key] = initial[f.key] == null ? "" : String(initial[f.key]);
    return o;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function update(key: string, v: string) {
    setVals((p) => ({ ...p, [key]: v }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    const body: Record<string, number | null> = {};
    for (const f of allFields) {
      const v = vals[f.key].trim();
      body[f.key] = v === "" ? null : Number(v);
    }
    try {
      const res = await fetch(`/api/tiktok-live/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setErr(json.error ?? `Failed (${res.status}).`);
        return;
      }
      setMsg("Saved.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Session metrics
        </h2>
        <span className="text-[11px] text-zinc-400">
          Check against your screenshots — edit any number and Save.
        </span>
      </div>

      {err && (
        <div className="my-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {err}
        </div>
      )}

      <Group title="Live performance" fields={LIVE_FIELDS} vals={vals} onChange={update} disabled={busy} />
      <Group
        title="TikTok backend (from screenshots)"
        fields={BACKEND_FIELDS}
        vals={vals}
        onChange={update}
        disabled={busy}
      />
      <Group title="Leads" fields={leadFields} vals={vals} onChange={update} disabled={busy} />

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save numbers"}
        </button>
        {msg && <span className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</span>}
      </div>
    </div>
  );
}

function Group({
  title,
  fields,
  vals,
  onChange,
  disabled,
}: {
  title: string;
  fields: Field[];
  vals: Record<string, string>;
  onChange: (key: string, v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-4 first:mt-2">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
        {fields.map((f) => (
          <label
            key={f.key}
            className="flex items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-900 py-1.5"
          >
            <span className="flex items-center gap-1.5 text-sm text-zinc-500">
              {f.label}
              {f.help && <HelpTip text={f.help} label={`What is ${f.label}?`} />}
            </span>
            <input
              inputMode="numeric"
              value={vals[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              disabled={disabled}
              placeholder="—"
              className={`w-24 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm text-right tabular-nums ${
                f.accent ? "font-semibold text-indigo-600 dark:text-indigo-400" : ""
              }`}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
