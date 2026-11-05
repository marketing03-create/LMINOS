"use client";

import { useState } from "react";
import { Sheet } from "@/components/mobile/sheet";
import { refreshEverywhere } from "@/app/actions/refresh-everywhere";
import { Label, Panel, StatusPill, btn, field } from "./ui";
import type { HandleLinkView, WatiConnectionView } from "./wati-connections";

/**
 * Lead routing: which WhatsApp numbers (on which WATI accounts) each TikTok
 * handle's leads arrive on. One row per handle; a handle can have several
 * numbers, even on several WATI accounts. The editor saves the whole set at
 * once (POST /api/admin/wati/links).
 */

/** 60164328160 → +60 16-432 8160 (Malaysian mobiles); anything else as +digits. */
export function fmtPhone(d: string): string {
  const m = /^60(1\d)(\d{3,4})(\d{4})$/.exec(d);
  return m ? `+60 ${m[1]}-${m[2]} ${m[3]}` : `+${d}`;
}

function waUrl(number: string, code: string | null) {
  return `https://wa.me/${number}?text=${encodeURIComponent(code ? `Hi ${code}` : "Hi")}`;
}

export function LeadRouting({
  handles,
  connections,
}: {
  handles: HandleLinkView[];
  connections: WatiConnectionView[];
}) {
  const [editing, setEditing] = useState<HandleLinkView | null>(null);
  const name = (id: string) => connections.find((c) => c.id === id)?.name ?? "WATI";

  return (
    <>
      {/* Phone: one card per handle. */}
      <ul className="space-y-3 lg:hidden">
        {handles.map((h) => (
          <li key={h.accountId}>
            <Panel className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-all font-mono text-sm font-medium">@{h.handle}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-zinc-500">
                    {h.code && <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">{h.code}</span>}
                    {h.autoFillTotalLeads && <span>Auto-fill on</span>}
                  </div>
                </div>
                <button type="button" onClick={() => setEditing(h)} className={btn.secondary}>
                  {h.links.length ? "Edit" : "Link"}
                </button>
              </div>
              <NumberChips h={h} name={name} connections={connections} className="mt-3" />
            </Panel>
          </li>
        ))}
      </ul>

      {/* Desktop: one table. */}
      <Panel className="hidden overflow-hidden lg:block">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="w-48 px-4 py-2.5">Handle</th>
              <th className="px-4 py-2.5">WhatsApp numbers</th>
              <th className="w-24 px-4 py-2.5">Code</th>
              <th className="w-28 px-4 py-2.5">Auto-fill</th>
              <th className="w-24 px-4 py-2.5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {handles.map((h) => (
              <tr key={h.accountId} className="align-top">
                <td className="px-4 py-3 font-mono font-medium">@{h.handle}</td>
                <td className="px-4 py-3">
                  <NumberChips h={h} name={name} connections={connections} />
                </td>
                <td className="px-4 py-3 font-mono text-zinc-700 dark:text-zinc-300">{h.code ?? "—"}</td>
                <td className="px-4 py-3">
                  {h.links.length ? (
                    <StatusPill tone={h.autoFillTotalLeads ? "ok" : "off"}>
                      {h.autoFillTotalLeads ? "On" : "Off"}
                    </StatusPill>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => setEditing(h)} className={btn.secondary}>
                    {h.links.length ? "Edit" : "Link"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? `@${editing.handle}` : ""}>
        {editing && (
          <RoutingForm key={editing.accountId} h={editing} connections={connections} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </>
  );
}

/** Each linked number as a chip: account · number, with its click-to-WhatsApp link. */
function NumberChips({
  h,
  name,
  connections,
  className = "",
}: {
  h: HandleLinkView;
  name: (id: string) => string;
  connections: WatiConnectionView[];
  className?: string;
}) {
  if (h.links.length === 0) {
    return <span className={`text-sm text-zinc-400 ${className}`}>Not linked</span>;
  }
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {h.links.map((l) => {
        // "Any number" links the account's first known number for the wa.me link.
        const number = l.channelPhone ?? connections.find((c) => c.id === l.connectionId)?.numbers[0] ?? null;
        return (
          <li
            key={`${l.connectionId}-${l.channelPhone ?? "any"}`}
            className="inline-flex max-w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 py-1 pl-2.5 pr-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <span className="min-w-0 truncate text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">{name(l.connectionId)}</span>
              <span className="mx-1 text-zinc-300 dark:text-zinc-600">·</span>
              <span className="font-medium tabular-nums">{l.channelPhone ? fmtPhone(l.channelPhone) : "Any number"}</span>
            </span>
            {number && <CopyLink url={waUrl(number, h.code)} />}
          </li>
        );
      })}
    </ul>
  );
}

/** Copies the click-to-WhatsApp link (wa.me) for one number. */
function CopyLink({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "yes" | "failed">("idle");
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setState("yes");
    } catch {
      setState("failed");
      window.prompt("Copy the WhatsApp link", url);
    }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={url}
      className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium text-blue-600 hover:bg-blue-50 active:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-950/40"
    >
      {state === "yes" ? "Copied ✓" : "Copy link"}
    </button>
  );
}

type Row = { connectionId: string; phone: string };

function RoutingForm({
  h,
  connections,
  onDone,
}: {
  h: HandleLinkView;
  connections: WatiConnectionView[];
  onDone: () => void;
}) {
  const first = connections[0]?.id ?? "";
  const [rows, setRows] = useState<Row[]>(
    h.links.length
      ? h.links.map((l) => ({ connectionId: l.connectionId, phone: l.channelPhone ? fmtPhone(l.channelPhone) : "" }))
      : [{ connectionId: first, phone: "" }]
  );
  const [code, setCode] = useState(h.code ?? "");
  const [autoFill, setAutoFill] = useState(h.autoFillTotalLeads);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save(links: Row[]) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/wati/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: h.accountId, links, code, autoFillTotalLeads: autoFill }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok === false) throw new Error(j.error ?? `Couldn't save (${res.status}).`);
      await refreshEverywhere();
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(rows);
      }}
      className="space-y-5 pb-2"
    >
      <div>
        <Label>WhatsApp numbers</Label>
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const conn = connections.find((c) => c.id === r.connectionId);
            const listId = `wa-nums-${h.accountId}-${i}`;
            return (
              <li key={i} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800 sm:flex-row sm:items-center sm:border-0 sm:p-0">
                <select
                  aria-label={`WATI account for number ${i + 1}`}
                  value={r.connectionId}
                  onChange={(e) => set(i, { connectionId: e.target.value })}
                  className={`${field} sm:w-52`}
                >
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-1 gap-2">
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    list={listId}
                    aria-label={`Number ${i + 1}`}
                    value={r.phone}
                    onChange={(e) => set(i, { phone: e.target.value })}
                    placeholder="Any number · e.g. 011-3335 5093"
                    className={`${field} tabular-nums`}
                  />
                  <datalist id={listId}>
                    {(conn?.numbers ?? []).map((n) => (
                      <option key={n} value={fmtPhone(n)} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    aria-label={`Remove number ${i + 1}`}
                    className={btn.icon}
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { connectionId: rs[rs.length - 1]?.connectionId ?? first, phone: "" }])}
          className={`${btn.secondary} mt-2`}
        >
          + Add number
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`code-${h.accountId}`}>
            <Label>Code</Label>
          </label>
          <input
            id={`code-${h.accountId}`}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={12}
            autoCapitalize="characters"
            placeholder={h.handle.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase()}
            className={`${field} font-mono`}
          />
        </div>
        <label className="flex min-h-11 items-center gap-3 self-end text-sm">
          <input type="checkbox" checked={autoFill} onChange={(e) => setAutoFill(e.target.checked)} className="h-5 w-5" />
          Auto-fill blank Total PM
        </label>
      </div>

      {err && (
        <p role="status" className="text-sm text-red-600 dark:text-red-400">
          {err}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:justify-between">
        {h.links.length > 0 ? (
          <button type="button" onClick={() => save([])} disabled={busy} className={btn.danger}>
            Unlink all
          </button>
        ) : (
          <span />
        )}
        <button type="submit" disabled={busy || connections.length === 0} className={btn.primary}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
