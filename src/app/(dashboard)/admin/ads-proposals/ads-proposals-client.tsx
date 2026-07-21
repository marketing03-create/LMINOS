"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type ProposalRow = {
  id: string;
  adAccountId: string;
  accountName: string;
  type: string;
  riskTier: string;
  target: string | null;
  change: string;
  rationale: string;
  projectedImpact: string | null;
  confidence: string | null;
};

export type RecentRow = {
  id: string;
  accountName: string;
  type: string;
  status: string;
  target: string | null;
  change: string;
};

export type AccountOption = {
  id: string;
  displayName: string;
  externalAccountId: string;
};

const TYPE_LABEL: Record<string, string> = {
  add_negative_keyword: "Add negative keyword",
  pause_keyword: "Pause keyword",
  adjust_budget: "Adjust budget",
  new_ad_copy: "New ad copy",
  monitor_term: "Monitor — keep watching",
};

// Monitor stands out from the "action" proposals — it's a watch, not a cut.
function typeChipCls(type: string): string {
  return type === "monitor_term"
    ? "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400"
    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300";
}

export function AdsProposalsClient({
  pending,
  recent,
  accounts,
  aiConfigured,
}: {
  pending: ProposalRow[];
  recent: RecentRow[];
  accounts: AccountOption[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [analyzing, setAnalyzing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinnedAccountId, setPinnedAccountId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, { accountId: string; rows: ProposalRow[] }>();
    for (const p of pending) {
      const g = m.get(p.accountName) ?? { accountId: p.adAccountId, rows: [] };
      g.rows.push(p);
      m.set(p.accountName, g);
    }
    const entries = [...m.entries()];
    // Keep the account you just analyzed pinned to the very top for this session
    // (it stays put until you reopen the tab). Server order is newest-first, so
    // this only matters right after an analyze.
    if (pinnedAccountId) {
      entries.sort((a, b) => {
        const ap = a[1].accountId === pinnedAccountId ? 0 : 1;
        const bp = b[1].accountId === pinnedAccountId ? 0 : 1;
        return ap - bp;
      });
    }
    return entries;
  }, [pending, pinnedAccountId]);

  async function analyze() {
    if (!accountId) return;
    setAnalyzing(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/ads-proposals/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adAccountId: accountId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setError(json.error ?? `Request failed (${res.status}).`);
        return;
      }
      setMsg(
        json.count
          ? `Generated ${json.count} proposal(s) — see below.`
          : "No changes worth proposing for this period."
      );
      // Pin this account's results to the top so they stay in view.
      setPinnedAccountId(accountId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  async function review(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/ads-proposals/${id}/${action}`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setError(json.error ?? `Request failed (${res.status}).`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {!aiConfigured && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          AI not configured yet. Create an <b>AI Gateway</b> key in your Vercel
          dashboard, set a monthly spend cap, then add{" "}
          <code>AI_GATEWAY_API_KEY</code> to Vercel + <code>.env.local</code>.
          Analysis stays disabled until then.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Analyze control */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4 flex flex-wrap items-end gap-3">
        <label className="block min-w-0 w-full sm:w-auto">
          <div className="text-xs font-medium mb-1">Account to analyze</div>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={`${inputCls} w-full`}
          >
            {accounts.length === 0 && <option value="">No Google accounts</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} ({a.externalAccountId})
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={analyze}
          disabled={analyzing || !accountId || !aiConfigured}
          className={btnPrimary}
        >
          {analyzing ? "Analyzing…" : "Analyze account"}
        </button>
        {msg && <span className="text-xs text-zinc-500">{msg}</span>}
      </div>

      {/* Pending proposals grouped by account */}
      {groups.length === 0 ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 px-4 py-10 text-center text-sm text-zinc-500">
          No pending proposals. Pick an account above and click{" "}
          <b>Analyze account</b> to generate recommendations.
        </div>
      ) : (
        groups.map(([accountName, g]) => (
          <div key={accountName} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              {accountName} · {g.rows.length} pending
            </h2>
            {g.rows.map((p) => (
              <div
                key={p.id}
                className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeChipCls(
                        p.type
                      )}`}
                    >
                      {TYPE_LABEL[p.type] ?? p.type}
                    </span>
                    <RiskBadge risk={p.riskTier} />
                    {p.confidence && (
                      <span className="text-[11px] text-zinc-500">
                        confidence: {p.confidence}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => review(p.id, "approve")}
                      disabled={busyId === p.id}
                      className={btnApprove}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => review(p.id, "reject")}
                      disabled={busyId === p.id}
                      className={btnSmall}
                    >
                      Reject
                    </button>
                  </div>
                </div>

                {p.target && (
                  <div className="mt-2 font-mono text-sm">{p.target}</div>
                )}
                <div className="mt-1 text-sm font-medium">{p.change}</div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {p.rationale}
                </p>
                {p.projectedImpact && (
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                    Projected: {p.projectedImpact}
                  </p>
                )}
              </div>
            ))}
          </div>
        ))
      )}

      {/* How-to / apply note */}
      <p className="text-xs text-zinc-500">
        <b>Approve</b> records your decision. For now, apply approved changes by
        hand in Google Ads (or bulk via Google Ads Editor). One-click auto-apply
        switches on automatically once Google grants Basic (write) access — no
        changes needed here.
      </p>

      {/* Recently reviewed */}
      {recent.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Recently reviewed
          </h2>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
                <tr>
                  <Th>Account</Th>
                  <Th>Type</Th>
                  <Th>Change</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-zinc-100 dark:border-zinc-900"
                  >
                    <td className="px-4 py-2.5">{r.accountName}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">
                      {TYPE_LABEL[r.type] ?? r.type}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.target ? <span className="font-mono">{r.target}</span> : r.change}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const cls =
    risk === "high"
      ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
      : risk === "medium"
        ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
        : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400";
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>
      {risk} risk
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "approved" || status === "applied"
      ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
      : status === "rejected"
        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
        : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400";
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>{status}</span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wider">
      {children}
    </th>
  );
}

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";
const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
const btnApprove =
  "inline-flex items-center rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50";
const btnSmall =
  "inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 text-xs disabled:opacity-50";
