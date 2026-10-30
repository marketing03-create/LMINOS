"use client";

import { useState } from "react";
import { Sheet } from "@/components/mobile/sheet";
import { refreshEverywhere } from "@/app/actions/refresh-everywhere";

/**
 * WhatsApp (WATI) connections — one collapsed row per WATI account: status dot,
 * name, contacts and today's count. Tapping opens it: the webhook URL to copy
 * into WATI, and the TikTok handles whose leads arrive on that account (with
 * their number, code, auto-fill and click-to-WhatsApp link).
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
  /** "8m ago", worked out on the server — a clock read here would differ
   *  between the server render and hydration and break it. */
  lastEventAgo: string | null;
  repliesTracked: boolean;
  contacts: number;
  contactsToday: number;
  /** Business numbers seen on this account (digits). */
  numbers: string[];
};

export type HandleLinkView = {
  accountId: string;
  handle: string;
  link: {
    connectionId: string;
    channelPhone: string | null;
    code: string | null;
    autoFillTotalLeads: boolean;
  } | null;
};

const fieldCls =
  "w-full h-12 rounded-md border border-zinc-300 bg-white px-2.5 text-base text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 lg:h-10 lg:text-sm";
const labelCls = "mb-1 block text-sm font-medium lg:text-xs";
const solidBtnCls =
  "inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-[15px] font-medium text-white transition-colors hover:bg-blue-500 active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950 lg:h-9 lg:text-sm";
const ghostBtnCls =
  "inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-[15px] font-medium text-zinc-800 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800 lg:h-9 lg:text-sm";

/** 60164328160 → +60 16-432 8160 (Malaysian mobiles); anything else as +digits. */
function fmtPhone(d: string): string {
  const m = /^60(1\d)(\d{3,4})(\d{4})$/.exec(d);
  return m ? `+60 ${m[1]}-${m[2]} ${m[3]}` : `+${d}`;
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

/**
 * Copy with the same fallback as the user invite: clipboard is refused in
 * several in-app webviews, so on failure select the text for a manual copy.
 */
function useCopy() {
  // The element to select on failure, held in state (a callback ref sets it).
  const [el, setRef] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<"yes" | "failed" | null>(null);
  async function copy(text: string) {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setState("yes");
      setTimeout(() => setState(null), 2000);
    } catch {
      setState("failed");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }
  return { setRef, state, copy };
}

export function WatiConnections({
  connections,
  handles,
}: {
  connections: WatiConnectionView[];
  handles: HandleLinkView[];
}) {
  const [editing, setEditing] = useState<WatiConnectionView | "new" | null>(null);

  return (
    <section id="wati">
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
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950">
          {connections.map((c) => (
            <ConnectionRow
              key={c.id}
              c={c}
              connections={connections}
              handles={handles}
              onEdit={() => setEditing(c)}
            />
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

function ConnectionRow({
  c,
  connections,
  handles,
  onEdit,
}: {
  c: WatiConnectionView;
  connections: WatiConnectionView[];
  handles: HandleLinkView[];
  onEdit: () => void;
}) {
  const { setRef: urlRef, state: urlState, copy: copyUrl } = useCopy();
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
      ? `Connected · ${c.lastEventAgo}`
      : state === "waiting"
        ? "Waiting for WATI"
        : "Off";
  const linkedHere = handles.filter((h) => h.link?.connectionId === c.id);

  async function runTest() {
    setTest({ busy: true, msg: null, ok: false });
    const r = await call(`/api/admin/wati/${c.id}`, { action: "test" });
    setTest({ busy: false, ok: r.ok, msg: r.ok ? "API works" : (r.error ?? "Failed") });
  }

  return (
    <li>
      <details className="group">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 active:bg-zinc-50 dark:active:bg-zinc-800 [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
          <span className="min-w-0 flex-1">
            <span className="block break-words text-base font-medium">{c.name}</span>
            <span className="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400">
              {statusText}
              {linkedHere.length > 0 && ` · ${linkedHere.map((h) => `@${h.handle}`).join(", ")}`}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-base font-semibold tabular-nums">{c.contacts}</span>
            <span className="block text-xs tabular-nums text-zinc-500">+{c.contactsToday} today</span>
          </span>
          <span
            aria-hidden="true"
            className="shrink-0 select-none text-zinc-400 transition-transform group-open:rotate-90"
          >
            &rsaquo;
          </span>
        </summary>

        <div className="space-y-5 border-t border-zinc-100 px-4 pb-4 pt-4 dark:border-zinc-800">
          {!c.repliesTracked && c.lastEventAt && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              Replies not tracked
            </p>
          )}

          <div>
            <div className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">Webhook URL</div>
            <div
              ref={urlRef}
              className="break-all rounded-md border border-zinc-200 bg-zinc-50 p-2.5 font-mono text-xs text-zinc-800 select-all dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            >
              {c.webhookUrl}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => copyUrl(c.webhookUrl)}
                className={`${solidBtnCls} flex-1 sm:flex-none`}
              >
                {urlState === "yes" ? "Copied ✓" : urlState === "failed" ? "Select and copy" : "Copy URL"}
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
              <button type="button" onClick={onEdit} className={`${ghostBtnCls} flex-1 sm:flex-none`}>
                Edit
              </button>
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

          {handles.length > 0 && (
            <div>
              <div className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">TikTok handles</div>
              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {handles.map((h) => (
                  <HandleRow key={h.accountId} h={h} conn={c} connections={connections} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

function HandleRow({
  h,
  conn,
  connections,
}: {
  h: HandleLinkView;
  conn: WatiConnectionView;
  connections: WatiConnectionView[];
}) {
  const here = h.link?.connectionId === conn.id;
  const elsewhere = h.link && !here ? connections.find((c) => c.id === h.link!.connectionId) : null;
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(here ? (h.link!.channelPhone ?? "") : (conn.numbers[0] ?? ""));
  const [code, setCode] = useState(here ? (h.link!.code ?? "") : "");
  const [autoFill, setAutoFill] = useState(here ? h.link!.autoFillTotalLeads : false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { setRef: waRef, state: waState, copy: copyWa } = useCopy();

  const linkPhone = here ? (h.link!.channelPhone ?? conn.numbers[0] ?? null) : null;
  const waUrl = linkPhone
    ? `https://wa.me/${linkPhone}?text=${encodeURIComponent(h.link?.code ? `Hi ${h.link.code}` : "Hi")}`
    : null;

  async function save(connectionId: string | null) {
    setBusy(true);
    setErr(null);
    const r = await call("/api/admin/wati/links", {
      accountId: h.accountId,
      connectionId,
      channelPhone: phone,
      code,
      autoFillTotalLeads: autoFill,
    });
    if (!r.ok) {
      setErr(r.error ?? "Couldn't save.");
      setBusy(false);
      return;
    }
    await refreshEverywhere();
    setBusy(false);
    setOpen(false);
  }

  const summary = here
    ? [
        h.link!.channelPhone ? fmtPhone(h.link!.channelPhone) : "Any number",
        h.link!.code,
        h.link!.autoFillTotalLeads ? "Auto-fill on" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : elsewhere
      ? `On ${elsewhere.name}`
      : "Not linked";

  return (
    <li className="px-3 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="break-all font-mono text-sm">@{h.handle}</div>
          <div
            className={`mt-0.5 text-xs ${
              here ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            {summary}
          </div>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className={ghostBtnCls}>
          {open ? "Close" : here ? "Edit" : "Link"}
        </button>
      </div>

      {here && waUrl && !open && (
        <div className="mt-2 flex items-center gap-2">
          <span
            ref={waRef}
            className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-500 select-all"
          >
            {waUrl}
          </span>
          <button type="button" onClick={() => copyWa(waUrl)} className={ghostBtnCls}>
            {waState === "yes" ? "Copied ✓" : waState === "failed" ? "Select" : "Copy link"}
          </button>
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor={`num-${conn.id}-${h.accountId}`} className={labelCls}>
              Number
            </label>
            <select
              id={`num-${conn.id}-${h.accountId}`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={fieldCls}
            >
              <option value="">Any number</option>
              {[...new Set([...conn.numbers, ...(phone ? [phone] : [])])].map((n) => (
                <option key={n} value={n}>
                  {fmtPhone(n)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`code-${conn.id}-${h.accountId}`} className={labelCls}>
              Code
            </label>
            <input
              id={`code-${conn.id}-${h.accountId}`}
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={12}
              autoCapitalize="characters"
              placeholder={h.handle.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase()}
              className={fieldCls}
            />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input
              type="checkbox"
              checked={autoFill}
              onChange={(e) => setAutoFill(e.target.checked)}
              className="h-5 w-5"
            />
            Auto-fill blank Total PM
          </label>
          {err && (
            <p role="status" className="text-sm text-red-600 dark:text-red-400">
              {err}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => save(conn.id)}
              disabled={busy}
              className={`${solidBtnCls} flex-1 sm:flex-none`}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {here && (
              <button
                type="button"
                onClick={() => save(null)}
                disabled={busy}
                className={`${ghostBtnCls} flex-1 border-red-300 text-red-700 sm:flex-none dark:border-red-900 dark:text-red-400`}
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
