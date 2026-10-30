"use client";

import { useRef, useState } from "react";
import { Sheet } from "@/components/mobile/sheet";
import { refreshEverywhere } from "@/app/actions/refresh-everywhere";

/**
 * WhatsApp (WATI) connections — one card per WATI account. The card's job is
 * the webhook URL: copy it into WATI → Webhooks, and the dot turns green the
 * first time WATI calls it. Add / edit happen in a sheet, phone and laptop alike.
 *
 * The API token never comes back to the page (`hasToken` only), so the edit
 * form's token field is always blank and blank means "keep the saved one".
 */

export type WatiConnectionView = {
  id: string;
  name: string;
  webhookUrl: string;
  apiEndpoint: string | null;
  hasToken: boolean;
  isActive: boolean;
  lastEventAt: string | null;
  contacts: number;
  contactsToday: number;
};

const fieldCls =
  "w-full h-12 rounded-md border border-zinc-300 bg-white px-2.5 text-base text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 lg:h-10 lg:text-sm";
const labelCls = "mb-1 block text-sm font-medium lg:text-xs";
const solidBtnCls =
  "inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-[15px] font-medium text-white transition-colors hover:bg-blue-500 active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950";
const ghostBtnCls =
  "inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-[15px] font-medium text-zinc-800 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800 lg:h-9 lg:text-sm";

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

async function call(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      return { ok: false, error: json.error ?? `Failed (${res.status}).` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Check your connection and try again." };
  }
}

export function WatiConnections({ connections }: { connections: WatiConnectionView[] }) {
  const [editing, setEditing] = useState<WatiConnectionView | "new" | null>(null);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">WhatsApp (WATI)</h2>
        <button type="button" onClick={() => setEditing("new")} className={ghostBtnCls}>
          Add WATI
        </button>
      </div>

      {connections.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex min-h-16 w-full items-center justify-center rounded-2xl border border-dashed border-zinc-300 px-4 text-sm text-zinc-500 active:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:active:bg-zinc-900"
        >
          No WATI account connected
        </button>
      ) : (
        <ul className="space-y-3">
          {connections.map((c) => (
            <ConnectionCard key={c.id} c={c} onEdit={() => setEditing(c)} />
          ))}
        </ul>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add WATI account" : (editing?.name ?? "")}
      >
        {editing !== null && (
          <ConnectionForm
            key={editing === "new" ? "new" : editing.id}
            existing={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

function ConnectionCard({ c, onEdit }: { c: WatiConnectionView; onEdit: () => void }) {
  const urlRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const [test, setTest] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({
    busy: false,
    msg: null,
    ok: false,
  });

  const state = !c.isActive ? "off" : c.lastEventAt ? "connected" : "waiting";
  const dot =
    state === "connected" ? "bg-emerald-500" : state === "waiting" ? "bg-amber-500" : "bg-zinc-400";
  const statusText =
    state === "connected"
      ? `Connected · ${ago(c.lastEventAt!)}`
      : state === "waiting"
        ? "Waiting for WATI"
        : "Off";

  // Same failure handling as the user invite: clipboard is refused in several
  // in-app webviews, so on failure select the URL for a manual copy.
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(c.webhookUrl);
      setCopied("yes");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("failed");
      const el = urlRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  async function runTest() {
    setTest({ busy: true, msg: null, ok: false });
    const r = await call(`/api/admin/wati/${c.id}`, { action: "test" });
    setTest({ busy: false, ok: r.ok, msg: r.ok ? "API works" : (r.error ?? "Failed") });
  }

  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0 flex-1">
          <div className="break-words text-base font-medium">{c.name}</div>
          <div className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{statusText}</div>
        </div>
        <button type="button" onClick={onEdit} className={ghostBtnCls}>
          Edit
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Contacts</dt>
          <dd className="text-lg font-semibold tabular-nums">{c.contacts}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">New today</dt>
          <dd className="text-lg font-semibold tabular-nums">{c.contactsToday}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <div className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">Webhook URL</div>
        <div
          ref={urlRef}
          className="break-all rounded-md border border-zinc-200 bg-zinc-50 p-2.5 font-mono text-xs text-zinc-800 select-all dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
        >
          {c.webhookUrl}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={copy} className={`${solidBtnCls} flex-1 sm:flex-none`}>
            {copied === "yes" ? "Copied ✓" : copied === "failed" ? "Select and copy" : "Copy URL"}
          </button>
          {c.hasToken && c.apiEndpoint && (
            <button
              type="button"
              onClick={runTest}
              disabled={test.busy}
              className={`${ghostBtnCls} flex-1 sm:flex-none`}
            >
              {test.busy ? "Testing…" : "Test API"}
            </button>
          )}
        </div>
        {test.msg && (
          <p
            role="status"
            className={`mt-2 text-sm ${
              test.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {test.msg}
          </p>
        )}
      </div>
    </li>
  );
}

function ConnectionForm({
  existing,
  onDone,
}: {
  existing: WatiConnectionView | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [endpoint, setEndpoint] = useState(existing?.apiEndpoint ?? "");
  const [token, setToken] = useState("");
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = existing
      ? await call(`/api/admin/wati/${existing.id}`, {
          name,
          apiEndpoint: endpoint,
          apiToken: token,
          isActive,
        })
      : await call("/api/admin/wati", { name, apiEndpoint: endpoint, apiToken: token });
    if (!r.ok) {
      setErr(r.error ?? "Couldn't save.");
      setBusy(false);
      return;
    }
    await refreshEverywhere();
    onDone();
  }

  async function rotate() {
    if (!existing) return;
    setBusy(true);
    setErr(null);
    const r = await call(`/api/admin/wati/${existing.id}`, { action: "rotate-key" });
    if (!r.ok) {
      setErr(r.error ?? "Couldn't change the URL.");
      setBusy(false);
      return;
    }
    await refreshEverywhere();
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-4 pb-2">
      <div>
        <label htmlFor="wati-name" className={labelCls}>
          Name
        </label>
        <input
          id="wati-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="WATI 1"
          required
          className={fieldCls}
        />
      </div>
      <div>
        <label htmlFor="wati-endpoint" className={labelCls}>
          API endpoint
        </label>
        <input
          id="wati-endpoint"
          type="url"
          inputMode="url"
          autoComplete="off"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://live-mt-server.wati.io/123456"
          className={fieldCls}
        />
      </div>
      <div>
        <label htmlFor="wati-token" className={labelCls}>
          Access token
        </label>
        <input
          id="wati-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={existing?.hasToken ? "Saved" : "Bearer eyJ…"}
          className={fieldCls}
        />
      </div>

      {existing && (
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-5 w-5"
          />
          On
        </label>
      )}

      {err && (
        <p role="status" className="text-sm text-red-600 dark:text-red-400">
          {err}
        </p>
      )}

      <button type="submit" disabled={busy || !name.trim()} className={`${solidBtnCls} w-full`}>
        {busy ? "Saving…" : existing ? "Save" : "Add"}
      </button>

      {existing && (
        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {confirmRotate ? (
            <div className="space-y-2">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                The current URL stops working. Paste the new one into WATI.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={rotate}
                  disabled={busy}
                  className={`${ghostBtnCls} flex-1 border-red-300 text-red-700 dark:border-red-900 dark:text-red-400`}
                >
                  Change URL
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRotate(false)}
                  className={`${ghostBtnCls} flex-1`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRotate(true)}
              className={`${ghostBtnCls} w-full`}
            >
              New webhook URL
            </button>
          )}
        </div>
      )}
    </form>
  );
}
