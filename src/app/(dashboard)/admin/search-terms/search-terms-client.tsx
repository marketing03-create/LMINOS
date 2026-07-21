"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DetailDrawer } from "./detail-drawer";

export type AccountOption = {
  id: string;
  displayName: string;
  externalAccountId: string;
};
export type CampaignOption = {
  campaignExternalId: string;
  campaignName: string | null;
};
export type SettingsShape = {
  competitorStrategy: string;
  brandNames: string;
  servicesNotOffered: string;
  supportedLocations: string;
  unsupportedLocations: string;
  minClicksBeforeExclude: number;
  minCostBeforeExcludeMyr: number;
};
export type AnalysisRow = {
  id: string;
  campaignExternalId: string;
  campaignName: string | null;
  term: string;
  decision: "KEEP" | "MONITOR" | "EXCLUDE";
  reviewStatus: string;
  recommendationType: string;
  intentCategory: string | null;
  commercialIntent: string | null;
  relevanceScore: number | null;
  confidenceScore: number | null;
  riskLevel: string | null;
  language: string | null;
  reason: string;
  riskExplanation: string | null;
  ruleApplied: string | null;
  overlapWarning: string | null;
  needsHumanReview: boolean;
  suggestedNegativeKeyword: string | null;
  suggestedMatchType: string | null;
  suggestedLevel: string | null;
  editedNegativeKeyword: string | null;
  editedMatchType: string | null;
  editedLevel: string | null;
  notes: string | null;
  spend: number | null;
  clicks: number | null;
  conversions: number | null;
  costPerConv: number | null;
};

const DECISION_FILTERS = ["ALL", "KEEP", "MONITOR", "EXCLUDE"] as const;
const STATUS_FILTERS = [
  "ALL",
  "PENDING_REVIEW",
  "APPROVED",
  "EDITED",
  "REJECTED",
  "APPLIED",
  "APPLY_FAILED",
] as const;

export function SearchTermsClient({
  accounts,
  campaigns,
  rows,
  settings,
  selectedAccountId,
  aiConfigured,
  writeEnabled,
}: {
  accounts: AccountOption[];
  campaigns: CampaignOption[];
  rows: AnalysisRow[];
  settings: SettingsShape | null;
  selectedAccountId: string;
  aiConfigured: boolean;
  writeEnabled: boolean;
}) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState("");
  const [decision, setDecision] = useState<(typeof DECISION_FILTERS)[number]>("ALL");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [reanalyse, setReanalyse] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!campaignId || r.campaignExternalId === campaignId) &&
          (decision === "ALL" || r.decision === decision) &&
          (status === "ALL" || r.reviewStatus === status)
      ),
    [rows, campaignId, decision, status]
  );

  const summary = useMemo(() => {
    const s = {
      total: rows.length,
      keep: 0,
      monitor: 0,
      exclude: 0,
      pending: 0,
      approved: 0,
      wastedCost: 0,
    };
    for (const r of rows) {
      if (r.decision === "KEEP") s.keep++;
      else if (r.decision === "MONITOR") s.monitor++;
      else if (r.decision === "EXCLUDE") {
        s.exclude++;
        s.wastedCost += r.spend ?? 0;
      }
      if (r.reviewStatus === "PENDING_REVIEW") s.pending++;
      if (r.reviewStatus === "APPROVED" || r.reviewStatus === "APPLIED") s.approved++;
    }
    return s;
  }, [rows]);

  function switchAccount(id: string) {
    setSelected(new Set());
    setCampaignId("");
    router.push(`/admin/search-terms?account=${id}`);
  }

  async function analyze() {
    if (!selectedAccountId) return;
    setAnalyzing(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/search-terms/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adAccountId: selectedAccountId,
          campaignExternalId: campaignId || null,
          reanalyse,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setError(json.error ?? `Request failed (${res.status}).`);
        return;
      }
      setMsg(
        `Analysed ${json.analysed} term(s)` +
          (json.skipped ? `, skipped ${json.skipped} already-done` : "") +
          (json.errors ? `, ${json.errors} batch error(s)` : "") +
          "."
      );
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
      const res = await fetch(`/api/search-terms/${id}/${action}`, { method: "POST" });
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

  async function bulk(action: "approve" | "reject") {
    if (selected.size === 0) return;
    setError(null);
    try {
      const res = await fetch("/api/search-terms/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setError(json.error ?? `Request failed (${res.status}).`);
        return;
      }
      setMsg(`${action === "approve" ? "Approved" : "Rejected"} ${json.count} term(s).`);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id))
    );
  }

  const drawerRow = drawerId ? rows.find((r) => r.id === drawerId) ?? null : null;

  return (
    <div className="space-y-6">
      {!aiConfigured && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          AI not configured yet. Add <code>AI_GATEWAY_API_KEY</code> (Vercel AI
          Gateway) to Vercel + <code>.env.local</code>. Analysis stays disabled
          until then.
        </div>
      )}
      {!writeEnabled && (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
          <b>Apply is in review-only mode.</b> Approving records your decision;
          &ldquo;Apply&rdquo; only <b>validates</b> the negative against Google and
          asks you to add it by hand (Google Ads Editor). One-click apply switches
          on once Google grants Basic write access and{" "}
          <code>ADS_AUTOMATION_ENABLED=true</code>.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4 flex flex-wrap items-end gap-3">
        <label className="block min-w-0">
          <div className="text-xs font-medium mb-1">Account</div>
          <select
            value={selectedAccountId}
            onChange={(e) => switchAccount(e.target.value)}
            className={inputCls}
          >
            {accounts.length === 0 && <option value="">No Google accounts</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} ({a.externalAccountId})
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <div className="text-xs font-medium mb-1">Campaign</div>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className={inputCls}
          >
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.campaignExternalId} value={c.campaignExternalId}>
                {c.campaignName ?? c.campaignExternalId}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 pb-2">
          <input
            type="checkbox"
            checked={reanalyse}
            onChange={(e) => setReanalyse(e.target.checked)}
          />
          Re-analyse existing
        </label>
        <button
          onClick={analyze}
          disabled={analyzing || !selectedAccountId || !aiConfigured}
          className={btnPrimary}
        >
          {analyzing ? "Analysing…" : "Analyse terms"}
        </button>
        <button onClick={() => setShowSettings((v) => !v)} className={btnSmall}>
          {showSettings ? "Hide settings" : "Settings"}
        </button>
        <a
          href={`/api/search-terms/export?accountId=${selectedAccountId}`}
          className={btnSmall}
        >
          Export CSV
        </a>
        {msg && <span className="text-xs text-zinc-500">{msg}</span>}
      </div>

      {showSettings && (
        <SettingsPanel
          accountId={selectedAccountId}
          initial={settings}
          onSaved={() => {
            setShowSettings(false);
            router.refresh();
          }}
        />
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Kpi label="Analysed" value={summary.total} />
        <Kpi label="Keep" value={summary.keep} tone="emerald" />
        <Kpi label="Monitor" value={summary.monitor} tone="amber" />
        <Kpi label="Exclude" value={summary.exclude} tone="red" />
        <Kpi label="Wasted (excl.)" value={`RM${summary.wastedCost.toFixed(0)}`} />
        <Kpi label="Awaiting" value={summary.pending} />
        <Kpi label="Approved" value={summary.approved} tone="emerald" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">Decision:</span>
        {DECISION_FILTERS.map((d) => (
          <Chip key={d} active={decision === d} onClick={() => setDecision(d)}>
            {d}
          </Chip>
        ))}
        <span className="ml-3 text-zinc-500">Status:</span>
        {STATUS_FILTERS.map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s.replace("_", " ")}
          </Chip>
        ))}
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          <button onClick={() => bulk("approve")} className={btnApprove}>
            Approve
          </button>
          <button onClick={() => bulk("reject")} className={btnSmall}>
            Reject
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-zinc-500 ml-1">
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 px-4 py-10 text-center text-sm text-zinc-500">
          No analyses yet for this filter. Pick an account/campaign and click{" "}
          <b>Analyse terms</b>.
        </div>
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
              <tr>
                <Th>
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                  />
                </Th>
                <Th>Term</Th>
                <Th>Clicks</Th>
                <Th>Cost</Th>
                <Th>Conv</Th>
                <Th>Decision</Th>
                <Th>Rel.</Th>
                <Th>Conf.</Th>
                <Th>Neg. keyword</Th>
                <Th>Match</Th>
                <Th>Risk</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const negKw = r.editedNegativeKeyword ?? r.suggestedNegativeKeyword;
                const match = r.editedMatchType ?? r.suggestedMatchType;
                return (
                  <tr
                    key={r.id}
                    className="border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-3 py-2 max-w-[220px]">
                      <button
                        onClick={() => setDrawerId(r.id)}
                        className="text-left hover:underline truncate block max-w-full"
                        title={r.term}
                      >
                        {r.term}
                      </button>
                      {r.overlapWarning && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          ⚠ overlap
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.clicks ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.spend != null ? `RM${r.spend.toFixed(0)}` : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.conversions ?? "—"}</td>
                    <td className="px-3 py-2">
                      <DecisionBadge decision={r.decision} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.relevanceScore ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{r.confidenceScore ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs max-w-[160px] truncate" title={negKw ?? ""}>
                      {negKw || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">{match && match !== "NONE" ? match : "—"}</td>
                    <td className="px-3 py-2">
                      {r.riskLevel ? <RiskBadge risk={r.riskLevel} /> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.reviewStatus} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {r.reviewStatus === "PENDING_REVIEW" && (
                          <>
                            <button
                              onClick={() => review(r.id, "approve")}
                              disabled={busyId === r.id}
                              className={btnApprove}
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => review(r.id, "reject")}
                              disabled={busyId === r.id}
                              className={btnSmall}
                            >
                              ✕
                            </button>
                          </>
                        )}
                        <button onClick={() => setDrawerId(r.id)} className={btnSmall}>
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {drawerRow && (
        <DetailDrawer
          row={drawerRow}
          writeEnabled={writeEnabled}
          onClose={() => setDrawerId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

function SettingsPanel({
  accountId,
  initial,
  onSaved,
}: {
  accountId: string;
  initial: SettingsShape | null;
  onSaved: () => void;
}) {
  const [s, setS] = useState<SettingsShape>(
    initial ?? {
      competitorStrategy: "MONITOR",
      brandNames: "",
      servicesNotOffered: "",
      supportedLocations: "",
      unsupportedLocations: "",
      minClicksBeforeExclude: 5,
      minCostBeforeExcludeMyr: 20,
    }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/search-terms/settings/${accountId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          competitorStrategy: s.competitorStrategy,
          brandNames: s.brandNames,
          servicesNotOffered: s.servicesNotOffered,
          supportedLocations: s.supportedLocations,
          unsupportedLocations: s.unsupportedLocations,
          minClicksBeforeExclude: s.minClicksBeforeExclude,
          minCostBeforeExcludeMyr: s.minCostBeforeExcludeMyr,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setErr(json.error ?? `Request failed (${res.status}).`);
        return;
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const set = (patch: Partial<SettingsShape>) => setS((p) => ({ ...p, ...patch }));

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4 space-y-3">
      <h3 className="text-sm font-semibold">Analysis settings for this account</h3>
      <p className="text-xs text-zinc-500">
        These drive the deterministic guards (brand protection, competitor
        strategy, thresholds). Comma-separate lists. The AI never sees anything
        else about the business.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Own brand / product names (never excluded)">
          <input
            className={`${inputCls} w-full`}
            value={s.brandNames}
            onChange={(e) => set({ brandNames: e.target.value })}
            placeholder="FlexiFund, MyLoan Capital"
          />
        </Field>
        <Field label="Competitor strategy">
          <select
            className={`${inputCls} w-full`}
            value={s.competitorStrategy}
            onChange={(e) => set({ competitorStrategy: e.target.value })}
          >
            <option value="EXCLUDE_ALL">Exclude all competitors</option>
            <option value="MONITOR">Monitor competitors</option>
            <option value="ALLOW">Allow competitors</option>
          </select>
        </Field>
        <Field label="Services NOT offered">
          <input
            className={`${inputCls} w-full`}
            value={s.servicesNotOffered}
            onChange={(e) => set({ servicesNotOffered: e.target.value })}
            placeholder="business loan, sme loan, car loan"
          />
        </Field>
        <Field label="Supported locations">
          <input
            className={`${inputCls} w-full`}
            value={s.supportedLocations}
            onChange={(e) => set({ supportedLocations: e.target.value })}
            placeholder="kuala lumpur, selangor"
          />
        </Field>
        <Field label="Unsupported locations">
          <input
            className={`${inputCls} w-full`}
            value={s.unsupportedLocations}
            onChange={(e) => set({ unsupportedLocations: e.target.value })}
            placeholder="sabah, sarawak"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min clicks before exclude">
            <input
              type="number"
              className={`${inputCls} w-full`}
              value={s.minClicksBeforeExclude}
              onChange={(e) => set({ minClicksBeforeExclude: Number(e.target.value) })}
            />
          </Field>
          <Field label="Min cost (RM) before exclude">
            <input
              type="number"
              className={`${inputCls} w-full`}
              value={s.minCostBeforeExcludeMyr}
              onChange={(e) => set({ minCostBeforeExcludeMyr: Number(e.target.value) })}
            />
          </Field>
        </div>
      </div>
      {err && <div className="text-xs text-red-600">{err}</div>}
      <button onClick={save} disabled={saving} className={btnPrimary}>
        {saving ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium mb-1">{label}</div>
      {children}
    </label>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "emerald" | "amber" | "red";
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "red"
          ? "text-red-600 dark:text-red-400"
          : "text-zinc-900 dark:text-zinc-100";
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full border ${
        active
          ? "bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
          : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
      }`}
    >
      {children}
    </button>
  );
}

function DecisionBadge({ decision }: { decision: string }) {
  const cls =
    decision === "KEEP"
      ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
      : decision === "MONITOR"
        ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
        : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400";
  return <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>{decision}</span>;
}

function RiskBadge({ risk }: { risk: string }) {
  const cls =
    risk === "HIGH"
      ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
      : risk === "MEDIUM"
        ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500";
  return <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>{risk}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "APPROVED" || status === "APPLIED"
      ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
      : status === "REJECTED"
        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
        : status === "APPLY_FAILED"
          ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
          : status === "EDITED"
            ? "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300";
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>
      {status.replace("_", " ").toLowerCase()}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 font-medium text-[11px] uppercase tracking-wider whitespace-nowrap">
      {children}
    </th>
  );
}

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";
const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
const btnApprove =
  "inline-flex items-center rounded-md bg-emerald-600 text-white px-2.5 py-1.5 text-xs font-medium disabled:opacity-50";
const btnSmall =
  "inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 text-xs disabled:opacity-50";
