"use client";

import { useState } from "react";
import { refreshEverywhere } from "@/app/actions/refresh-everywhere";

/**
 * Google Drive for customer documents: the service account key TT Stars uses,
 * and which Shared Drive each TikTok handle's customer folders go in.
 */

export type DriveHandleView = {
  accountId: string;
  handle: string;
  sharedDriveId: string | null;
  sharedDriveName: string | null;
};

const INPUT =
  "block min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-60";

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    return res.ok && j?.ok ? { ok: true } : { ok: false, error: j?.error ?? `Failed (${res.status}).` };
  } catch {
    return { ok: false, error: "You look offline. Try again." };
  }
}

export function DriveSetup({ email, handles }: { email: string | null; handles: DriveHandleView[] }) {
  const [editingKey, setEditingKey] = useState(!email);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function saveKey() {
    setBusy(true);
    setErr(null);
    const r = await post("/api/admin/drive", { key });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Couldn't save.");
    setKey("");
    setEditingKey(false);
    await refreshEverywhere();
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 lg:rounded-xl lg:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">Google Drive (customer documents)</h2>
        <span
          className={`text-xs font-medium uppercase tracking-wider ${
            email ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {email ? "connected" : "not connected"}
        </span>
      </div>

      {email && !editingKey && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="break-all text-sm text-zinc-600 dark:text-zinc-400">{email}</p>
          <button
            type="button"
            onClick={() => setEditingKey(true)}
            className="min-h-11 text-sm font-medium text-blue-600 dark:text-blue-400"
          >
            Change key
          </button>
        </div>
      )}

      {editingKey && (
        <div className="mb-4 space-y-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="drive-key">
            Service account JSON key
          </label>
          <textarea
            id="drive-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            rows={4}
            spellCheck={false}
            autoComplete="off"
            disabled={busy}
            className={`${INPUT} py-2 font-mono text-xs`}
          />
          {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={saveKey} disabled={busy || !key.trim()} className={BUTTON}>
              {busy ? "Checking…" : "Save key"}
            </button>
            {email && (
              <button
                type="button"
                onClick={() => {
                  setEditingKey(false);
                  setErr(null);
                }}
                className="min-h-11 px-2 text-sm text-zinc-600 dark:text-zinc-400"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {email && (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {handles.map((h) => (
            <HandleDrive key={h.accountId} h={h} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HandleDrive({ h }: { h: DriveHandleView }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(h.sharedDriveId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(sharedDrive: string | null) {
    setBusy(true);
    setErr(null);
    const r = await post("/api/admin/drive/links", { accountId: h.accountId, sharedDrive });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Couldn't save.");
    setOpen(false);
    await refreshEverywhere();
  }

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm">@{h.handle}</p>
          <p className="break-words text-xs text-zinc-500 dark:text-zinc-400">
            {h.sharedDriveId ? (h.sharedDriveName ?? h.sharedDriveId) : "No Shared Drive"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-h-11 shrink-0 text-sm font-medium text-blue-600 dark:text-blue-400"
        >
          {open ? "Close" : h.sharedDriveId ? "Change" : "Link"}
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Shared Drive link"
            aria-label={`Shared Drive link for @${h.handle}`}
            autoComplete="off"
            disabled={busy}
            className={INPUT}
          />
          {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => save(value)} disabled={busy || !value.trim()} className={BUTTON}>
              {busy ? "Checking…" : "Save"}
            </button>
            {h.sharedDriveId && (
              <button
                type="button"
                onClick={() => save(null)}
                disabled={busy}
                className="min-h-11 px-2 text-sm text-red-600 dark:text-red-400"
              >
                Unlink
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
