"use client";

import { useState } from "react";
import { refreshEverywhere } from "@/app/actions/refresh-everywhere";
import { Label, Panel, Section, StatusPill, btn, field } from "./ui";

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

const INPUT = field;
const BUTTON = btn.primary;

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
    <Section id="drive" title="Google Drive" meta="customer documents">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="font-semibold">Service account</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusPill tone={email ? "ok" : "warn"}>{email ? "Connected" : "Not connected"}</StatusPill>
              {email && <span className="break-all text-sm text-zinc-600 dark:text-zinc-400">{email}</span>}
            </div>
          </div>
          {email && !editingKey && (
            <button type="button" onClick={() => setEditingKey(true)} className={btn.secondary}>
              Change key
            </button>
          )}
        </div>

        {editingKey && (
          <div className="space-y-2 border-b border-zinc-100 px-4 py-4 dark:border-zinc-800">
            <label htmlFor="drive-key">
              <Label>Service account JSON key</Label>
            </label>
            <textarea
              id="drive-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              rows={4}
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
              className={`${INPUT.replace("h-11", "").replace("lg:h-9", "")} py-2 font-mono text-xs`}
            />
            {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
            <div className="flex gap-2">
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
                  className={btn.secondary}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {email && (
          <>
            <div className="hidden grid-cols-[12rem_1fr_auto] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 lg:grid">
              <span>Handle</span>
              <span>Shared Drive</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {handles.map((h) => (
                <HandleDrive key={h.accountId} h={h} />
              ))}
            </ul>
          </>
        )}
      </Panel>
    </Section>
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
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3 lg:grid lg:grid-cols-[12rem_1fr_auto] lg:gap-4">
        <p className="font-mono text-sm font-medium">@{h.handle}</p>
        <p className="hidden min-w-0 break-words text-sm text-zinc-600 dark:text-zinc-400 lg:block">
          {h.sharedDriveId ? (h.sharedDriveName ?? h.sharedDriveId) : <span className="text-zinc-400">Not linked</span>}
        </p>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={btn.secondary}>
          {open ? "Close" : h.sharedDriveId ? "Change" : "Link"}
        </button>
      </div>
      <p className="mt-0.5 break-words text-xs text-zinc-500 dark:text-zinc-400 lg:hidden">
        {h.sharedDriveId ? (h.sharedDriveName ?? h.sharedDriveId) : "Not linked"}
      </p>
      {open && (
        <div className="mt-3 space-y-2">
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
          <div className="flex gap-2">
            <button type="button" onClick={() => save(value)} disabled={busy || !value.trim()} className={BUTTON}>
              {busy ? "Checking…" : "Save"}
            </button>
            {h.sharedDriveId && (
              <button type="button" onClick={() => save(null)} disabled={busy} className={btn.danger}>
                Unlink
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
