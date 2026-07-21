"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentRow, WebsiteAccountRow } from "@/lib/ads/website-metrics";

type Website = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isActive: boolean;
  whatsappNumber: string | null;
  notes: string | null;
};

export function WebsiteDetailClient({
  website,
  accounts,
  pool,
  allAgents,
}: {
  website: Website;
  accounts: WebsiteAccountRow[];
  pool: AgentRow[];
  allAgents: AgentRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(url + method);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setError(json.error ?? `Request failed (${res.status}).`);
        return false;
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const poolIds = new Set(pool.map((p) => p.userId));
  const addable = allAgents.filter((a) => !poolIds.has(a.userId));

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      <Settings website={website} call={call} busy={busy} />

      {/* Ad accounts */}
      <Card title="Ad accounts" subtitle="Accounts driving traffic to this website. Suspend the old one and add a replacement — history stays, ROAS is continuous.">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="text-zinc-500 text-left">
            <tr>
              <Th>Account</Th>
              <Th>Customer ID</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-zinc-500">
                  No ad accounts linked.{" "}
                  <Link href="/admin/ad-accounts/add" className="underline">
                    Add one
                  </Link>
                  .
                </td>
              </tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id} className="border-t border-zinc-100 dark:border-zinc-900">
                <Td>
                  <Link href={`/admin/ad-accounts/${a.id}`} className="hover:underline font-medium">
                    {a.displayName}
                  </Link>
                  <div className="text-xs text-zinc-500">
                    {a.platform}
                    {!a.hasToken && a.platform === "google" && (
                      <span className="text-amber-500"> · no token</span>
                    )}
                  </div>
                </Td>
                <Td className="font-mono text-xs">{a.externalAccountId}</Td>
                <Td>
                  <AccountStatus status={a.status} active={a.isActive} />
                </Td>
                <Td className="text-right">
                  <AccountActions
                    account={a}
                    others={accounts.filter((x) => x.id !== a.id)}
                    call={call}
                    busy={busy}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>

      {/* Agent pool */}
      <Card title="Agent pool" subtitle="Agents who work this website's leads. Leads belong to the pool (no single owner); revenue is credited to whoever closes the sale.">
        <div className="flex flex-wrap gap-2 mb-4">
          {pool.length === 0 && (
            <span className="text-sm text-zinc-500">No agents in the pool yet.</span>
          )}
          {pool.map((p) => (
            <span
              key={p.userId}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-100 dark:bg-zinc-900 pl-3 pr-1.5 py-1 text-sm"
            >
              {p.fullName ?? p.email}
              <button
                onClick={() =>
                  call(`/api/websites/${website.id}/agents`, "DELETE", { userId: p.userId })
                }
                disabled={!!busy}
                className="rounded-full w-5 h-5 inline-flex items-center justify-center text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                title="Remove from pool"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <AddAgent websiteId={website.id} addable={addable} call={call} busy={busy} />
      </Card>
    </div>
  );
}

type CallFn = (url: string, method: string, body?: unknown) => Promise<boolean>;

function Settings({
  website,
  call,
  busy,
}: {
  website: Website;
  call: CallFn;
  busy: string | null;
}) {
  const [name, setName] = useState(website.name);
  const [whatsapp, setWhatsapp] = useState(website.whatsappNumber ?? "");
  const [notes, setNotes] = useState(website.notes ?? "");

  return (
    <Card title="Settings">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <div className="text-xs font-medium mb-1">Name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <div className="text-xs font-medium mb-1">WhatsApp number</div>
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={inputCls} />
        </label>
        <label className="block flex-1 min-w-[200px]">
          <div className="text-xs font-medium mb-1">Notes</div>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls + " w-full"} />
        </label>
        <button
          onClick={() =>
            call(`/api/websites/${website.id}`, "PATCH", {
              name,
              whatsappNumber: whatsapp,
              notes,
            })
          }
          disabled={!!busy}
          className={btnPrimary}
        >
          Save
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() =>
            call(`/api/websites/${website.id}`, "PATCH", {
              status: website.status === "active" ? "paused" : "active",
            })
          }
          disabled={!!busy}
          className={btnGhost}
        >
          {website.status === "active" ? "Pause website" : "Resume website"}
        </button>
        <button
          onClick={() =>
            call(`/api/websites/${website.id}`, "PATCH", { isActive: !website.isActive })
          }
          disabled={!!busy}
          className={btnGhost}
        >
          {website.isActive ? "Deactivate" : "Reactivate"}
        </button>
      </div>
    </Card>
  );
}

function AccountActions({
  account,
  others,
  call,
  busy,
}: {
  account: WebsiteAccountRow;
  others: WebsiteAccountRow[];
  call: CallFn;
  busy: string | null;
}) {
  const [replaceWith, setReplaceWith] = useState("");
  return (
    <div className="inline-flex items-center gap-2 justify-end flex-wrap">
      {account.status === "active" ? (
        <button
          onClick={() => call(`/api/ad-accounts/${account.id}/suspend`, "POST", { suspend: true })}
          disabled={!!busy}
          className={btnSmall}
        >
          Suspend
        </button>
      ) : (
        <button
          onClick={() => call(`/api/ad-accounts/${account.id}/suspend`, "POST", { suspend: false })}
          disabled={!!busy}
          className={btnSmall}
        >
          Reactivate
        </button>
      )}
      {others.length > 0 && (
        <span className="inline-flex items-center gap-1">
          <select
            value={replaceWith}
            onChange={(e) => setReplaceWith(e.target.value)}
            className="max-w-full min-w-0 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
          >
            <option value="">replace with…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.displayName}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (replaceWith)
                call(`/api/ad-accounts/${account.id}/replace`, "POST", {
                  replacementAccountId: replaceWith,
                });
            }}
            disabled={!!busy || !replaceWith}
            className={btnSmall}
          >
            Go
          </button>
        </span>
      )}
    </div>
  );
}

function AddAgent({
  websiteId,
  addable,
  call,
  busy,
}: {
  websiteId: string;
  addable: AgentRow[];
  call: CallFn;
  busy: string | null;
}) {
  const [userId, setUserId] = useState("");
  if (addable.length === 0) {
    return <p className="text-xs text-zinc-500">All sales agents are already in this pool.</p>;
  }
  return (
    <div className="flex items-center gap-2">
      <select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="max-w-full min-w-0 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
      >
        <option value="">Add an agent…</option>
        {addable.map((a) => (
          <option key={a.userId} value={a.userId}>
            {a.fullName ?? a.email}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          if (userId) call(`/api/websites/${websiteId}/agents`, "POST", { userId });
        }}
        disabled={!!busy || !userId}
        className={btnPrimary}
      >
        Add
      </button>
    </div>
  );
}

function AccountStatus({ status, active }: { status: string; active: boolean }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
    suspended: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
    replaced: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
  };
  const cls = map[status] ?? map.replaced;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>
      {status}
      {!active && status === "active" ? " (inactive)" : ""}
    </span>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-2 font-medium text-xs uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-2.5 ${className}`}>{children}</td>;
}

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";
const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
const btnGhost =
  "inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50";
const btnSmall =
  "inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2.5 py-1 text-xs disabled:opacity-50";
