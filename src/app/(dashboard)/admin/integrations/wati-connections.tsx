"use client";

import { useState } from "react";
import { Sheet } from "@/components/mobile/sheet";
import { refreshEverywhere } from "@/app/actions/refresh-everywhere";
import { LeadRouting, fmtPhone } from "./lead-routing";
import { Label, Panel, Section, Stat, StatusPill, btn, field } from "./ui";

/**
 * WhatsApp (WATI): one card per WATI account — status, customers, the webhook
 * URL to paste into WATI, the API check and the daily cross-check — then the
 * Lead routing table (which numbers each TikTok handle's leads arrive on).
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
  /** Median minutes to first CS reply, today's leads. Null = none replied yet. */
  replyMedianToday: number | null;
  contacts: number;
  contactsToday: number;
  /** Business numbers seen on this account (digits). */
  numbers: string[];
  /** Last message a customer sent: "5m ago", worked out on the server. */
  lastCustomerAgo: string | null;
  lastCustomerHours: number | null;
  /** The last week's cross-checks with WATI, newest first. */
  checks: CrossCheckView[];
};

export type CrossCheckView = {
  day: string;
  watiCustomers: number;
  found: number;
  missing: { last4: string; name: string | null; at: string; number: string }[];
  notCustomers: number;
  unchecked: number;
  error: string | null;
  checkedAgo: string;
};

/** A handle and every WATI account + number its leads arrive on (can be several). */
export type HandleLinkView = {
  accountId: string;
  handle: string;
  code: string | null;
  autoFillTotalLeads: boolean;
  /** channelPhone null = any number on that account. */
  links: { connectionId: string; channelPhone: string | null }[];
};

function fmtReply(m: number): string {
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${Math.round(m % 60)}m`;
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
  yesterday,
}: {
  connections: WatiConnectionView[];
  handles: HandleLinkView[];
  /** Malaysia's yesterday, YYYY-MM-DD — the cross-check's default day. */
  yesterday: string;
}) {
  const [editing, setEditing] = useState<WatiConnectionView | "new" | null>(null);

  return (
    <Section
      id="whatsapp"
      title="WhatsApp (WATI)"
      meta={`${connections.length} account${connections.length === 1 ? "" : "s"}`}
      action={
        <button type="button" onClick={() => setEditing("new")} className={btn.secondary}>
          + Add account
        </button>
      }
    >
      {connections.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex min-h-16 w-full items-center justify-center rounded-xl border border-dashed border-zinc-300 px-4 text-sm text-zinc-500 active:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:active:bg-zinc-900"
        >
          No WATI account connected
        </button>
      ) : (
        <div className="space-y-8">
          <div>
            <div className="grid gap-4 xl:grid-cols-2">
              {connections.map((c) => (
                <AccountCard key={c.id} c={c} handles={handles} onEdit={() => setEditing(c)} />
              ))}
            </div>
            <CrossCheckRun yesterday={yesterday} />
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Lead routing</h3>
            <LeadRouting handles={handles} connections={connections} />
          </div>
        </div>
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
    </Section>
  );
}

function AccountCard({
  c,
  handles,
  onEdit,
}: {
  c: WatiConnectionView;
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
  const linkedHere = handles.filter((h) => h.links.some((l) => l.connectionId === c.id));
  const quiet = c.lastCustomerHours === null || c.lastCustomerHours > 3;
  const latest = c.checks[0];

  async function runTest() {
    setTest({ busy: true, msg: null, ok: false });
    const r = await call(`/api/admin/wati/${c.id}`, { action: "test" });
    setTest({ busy: false, ok: r.ok, msg: r.ok ? "API works" : (r.error ?? "Failed") });
  }

  return (
    // min-w-0: a grid item otherwise grows to its longest line (the webhook URL).
    <Panel className="flex min-w-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0">
          <div className="break-words font-semibold">{c.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusPill tone={state === "connected" ? "ok" : state === "waiting" ? "warn" : "off"}>
              {state === "connected" ? `Connected · ${c.lastEventAgo}` : state === "waiting" ? "Waiting for WATI" : "Off"}
            </StatusPill>
            {state !== "off" && !c.repliesTracked && <StatusPill tone="warn">Replies not tracked</StatusPill>}
          </div>
        </div>
        <button type="button" onClick={onEdit} className={btn.secondary}>
          Edit
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800 sm:grid-cols-4">
        <Stat label="Customers" value={c.contacts.toLocaleString("en-MY")} />
        <Stat label="New today" value={`+${c.contactsToday}`} />
        <Stat label="Last customer" value={c.lastCustomerAgo ?? "None yet"} tone={quiet ? "warn" : undefined} />
        <Stat
          label="Median reply today"
          value={c.repliesTracked && c.replyMedianToday !== null ? fmtReply(c.replyMedianToday) : "—"}
          tone={c.repliesTracked && c.replyMedianToday !== null ? "accent" : undefined}
        />
      </dl>

      <div className="flex-1 space-y-4 px-4 py-4">
        <div>
          <Label>Webhook URL</Label>
          <div className="flex gap-2">
            <div
              ref={urlRef}
              title={c.webhookUrl}
              className="flex h-11 min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-xs text-zinc-700 select-all dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 lg:h-9"
            >
              <span className="truncate">{c.webhookUrl}</span>
            </div>
            <button type="button" onClick={() => copyUrl(c.webhookUrl)} className={btn.primary}>
              {urlState === "yes" ? "Copied ✓" : urlState === "failed" ? "Select" : "Copy"}
            </button>
          </div>
        </div>

        <div>
          <Label>API</Label>
          <div className="flex flex-wrap items-center gap-2">
            {c.hasToken && c.apiEndpoint ? (
              <>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">Token saved</span>
                <button type="button" onClick={runTest} disabled={test.busy} className={btn.secondary}>
                  {test.busy ? "Testing…" : "Test API"}
                </button>
              </>
            ) : (
              <StatusPill tone="warn">No API token</StatusPill>
            )}
            {test.msg && (
              <span
                role="status"
                className={`text-sm ${test.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
              >
                {test.msg}
              </span>
            )}
          </div>
        </div>

        {latest && (
          <div>
            <Label>Cross-check</Label>
            <CheckSummary check={latest} />
            {c.checks.length > 0 && (
              <details className="group mt-2">
                <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 [&::-webkit-details-marker]:hidden">
                  Last {c.checks.length} day{c.checks.length === 1 ? "" : "s"}
                  <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <CrossCheckList checks={c.checks} />
              </details>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-100 px-4 py-2.5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {linkedHere.length ? (
          <>Handles: {linkedHere.map((h) => `@${h.handle}`).join(", ")}</>
        ) : (
          "No handle routed here"
        )}
        {c.numbers.length > 0 && <> · Numbers: {c.numbers.map(fmtPhone).join(", ")}</>}
      </div>
    </Panel>
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
        <label htmlFor="wati-name">
          <Label>Name</Label>
        </label>
        <input
          id="wati-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="WATI 1"
          required
          className={field}
        />
      </div>
      <div>
        <label htmlFor="wati-endpoint">
          <Label>API endpoint</Label>
        </label>
        <input
          id="wati-endpoint"
          type="url"
          inputMode="url"
          autoComplete="off"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://live-mt-server.wati.io/123456"
          className={field}
        />
      </div>
      <div>
        <label htmlFor="wati-token">
          <Label>Access token</Label>
        </label>
        <input
          id="wati-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={existing?.hasToken ? "Saved" : "Bearer eyJ…"}
          className={field}
        />
      </div>

      {existing && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
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

      <button type="submit" disabled={busy || !name.trim()} className={`${btn.primary} w-full`}>
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
                <button type="button" onClick={rotate} disabled={busy} className={`${btn.danger} flex-1`}>
                  Change URL
                </button>
                <button type="button" onClick={() => setConfirmRotate(false)} className={`${btn.secondary} flex-1`}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmRotate(true)} className={`${btn.secondary} w-full`}>
              New webhook URL
            </button>
          )}
        </div>
      )}
    </form>
  );
}

const checkDayFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "UTC", // `day` is already a calendar date
  weekday: "short",
  day: "numeric",
  month: "short",
});
const missingAtFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dayLabel = (day: string) => checkDayFmt.format(new Date(`${day}T00:00:00Z`));

/** The latest cross-check's verdict, one line. */
function CheckSummary({ check }: { check: CrossCheckView }) {
  if (check.error) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{dayLabel(check.day)}</span>
        <StatusPill tone="warn">Couldn&apos;t run</StatusPill>
      </div>
    );
  }
  const n = check.missing.length;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{dayLabel(check.day)}</span>
      <span className="tabular-nums text-zinc-600 dark:text-zinc-300">
        WATI {check.watiCustomers} · TT Stars {check.found}
      </span>
      {n > 0 ? <StatusPill tone="bad">{n} missing</StatusPill> : <StatusPill tone="ok">Match</StatusPill>}
    </div>
  );
}

/** The last week of cross-checks, with the missing customers listed. */
function CrossCheckList({ checks }: { checks: CrossCheckView[] }) {
  return (
    <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {checks.map((k) => (
        <li key={k.day} className="px-3 py-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{dayLabel(k.day)}</span>
            {k.error ? (
              <span className="text-right text-zinc-500">{k.error}</span>
            ) : (
              <span className="text-right tabular-nums">
                WATI {k.watiCustomers} · TT Stars {k.found}{" "}
                {k.missing.length > 0 ? (
                  <span className="font-semibold text-red-600 dark:text-red-400">· {k.missing.length} missing</span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                )}
              </span>
            )}
          </div>
          {!k.error && (k.notCustomers > 0 || k.unchecked > 0) && (
            <div className="mt-0.5 text-xs text-zinc-500">
              {k.notCustomers > 0 && `${k.notCustomers} other new WATI contact${k.notCustomers === 1 ? "" : "s"} (CS wrote first, or another number)`}
              {k.notCustomers > 0 && k.unchecked > 0 && " · "}
              {k.unchecked > 0 && `${k.unchecked} not checked`}
            </div>
          )}
          {k.missing.length > 0 && (
            <ul className="mt-2 space-y-1">
              {k.missing.map((m, i) => (
                <li
                  key={`${m.last4}-${i}`}
                  className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-900 dark:bg-red-950/30 dark:text-red-300"
                >
                  <span className="font-mono">•••• {m.last4}</span>
                  {m.name ? ` · ${m.name}` : ""} · {missingAtFmt.format(new Date(m.at))} · to …{m.number}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-0.5 text-xs text-zinc-400">Checked {k.checkedAgo}</div>
        </li>
      ))}
    </ul>
  );
}

/** Run the cross-check now, for a chosen day (default: yesterday). */
function CrossCheckRun({ yesterday }: { yesterday: string }) {
  const [day, setDay] = useState(yesterday);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const r = await call("/api/admin/wati/check", { day });
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: "Checked ✓" });
      void refreshEverywhere();
    } else {
      setMsg({ ok: false, text: r.error ?? "The check failed." });
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">Cross-check a day</span>
      <input
        type="date"
        aria-label="Cross-check day"
        value={day}
        max={yesterday}
        onChange={(e) => setDay(e.target.value)}
        disabled={busy}
        className={field.replace("w-full", "w-44")}
      />
      <button type="button" onClick={run} disabled={busy || !day} className={btn.secondary}>
        {busy ? "Checking WATI…" : "Check now"}
      </button>
      {msg && (
        <span
          role="status"
          className={`text-sm ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}
