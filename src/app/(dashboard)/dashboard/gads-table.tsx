"use client";

/**
 * Google Ads per-account performance table on the Overview (Feature S).
 * Date range comes from the page's DateFilter (server-fetched rows); this
 * component adds client-side controls: an ACCOUNT picker, a SORT control (any
 * metric, asc/desc), and METRIC column toggles. Account names link to the
 * per-account detail page (same as the Ad accounts page). Zero-activity
 * accounts are hidden by default.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtInt, fmtMyr, fmtMyr2, fmtPct2 } from "@/lib/roas/metrics";

export type GadsRow = {
  accountId: string;
  displayName: string;
  externalAccountId: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

type MetricDef = {
  key: string;
  label: string;
  value: (r: GadsRow) => string;
  sort: (r: GadsRow) => number | null; // null = no data (sorts to the bottom)
};

// Column order = Conversions LAST (after Cost/conv).
const METRICS: MetricDef[] = [
  { key: "spend", label: "Spend", value: (r) => fmtMyr(r.spend), sort: (r) => r.spend },
  { key: "impressions", label: "Impressions", value: (r) => fmtInt(r.impressions), sort: (r) => r.impressions },
  { key: "clicks", label: "Clicks", value: (r) => fmtInt(r.clicks), sort: (r) => r.clicks },
  {
    key: "ctr",
    label: "CTR",
    value: (r) => fmtPct2(r.impressions > 0 ? r.clicks / r.impressions : null),
    sort: (r) => (r.impressions > 0 ? r.clicks / r.impressions : null),
  },
  {
    key: "avgCpc",
    label: "Avg CPC",
    value: (r) => fmtMyr2(r.clicks > 0 ? r.spend / r.clicks : null),
    sort: (r) => (r.clicks > 0 ? r.spend / r.clicks : null),
  },
  {
    key: "costPerConv",
    label: "Cost/conv",
    value: (r) => fmtMyr2(r.conversions > 0 ? r.spend / r.conversions : null),
    sort: (r) => (r.conversions > 0 ? r.spend / r.conversions : null),
  },
  { key: "conversions", label: "Conversions", value: (r) => fmtInt(r.conversions), sort: (r) => r.conversions },
];

const hasActivity = (r: GadsRow) =>
  r.spend > 0 || r.impressions > 0 || r.clicks > 0 || r.conversions > 0;

export function GadsTable({ rows }: { rows: GadsRow[] }) {
  const [accountId, setAccountId] = useState<string>("all");
  const [visible, setVisible] = useState<Set<string>>(new Set(METRICS.map((m) => m.key)));
  const [showZero, setShowZero] = useState(false);
  const [sortKey, setSortKey] = useState<string>("spend");
  const [dir, setDir] = useState<"desc" | "asc">("desc");

  const shown = useMemo(() => {
    let out = rows;
    if (accountId !== "all") out = out.filter((r) => r.accountId === accountId);
    else if (!showZero) out = out.filter(hasActivity);
    const metric = METRICS.find((m) => m.key === sortKey) ?? METRICS[0];
    return [...out].sort((a, b) => {
      const va = metric.sort(a);
      const vb = metric.sort(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // no-data rows always sink to the bottom
      if (vb == null) return -1;
      return dir === "desc" ? vb - va : va - vb;
    });
  }, [rows, accountId, showZero, sortKey, dir]);

  const cols = METRICS.filter((m) => visible.has(m.key));

  const total: GadsRow = useMemo(
    () => ({
      accountId: "total",
      displayName: "All accounts (total)",
      externalAccountId: "",
      spend: shown.reduce((a, r) => a + r.spend, 0),
      impressions: shown.reduce((a, r) => a + r.impressions, 0),
      clicks: shown.reduce((a, r) => a + r.clicks, 0),
      conversions: shown.reduce((a, r) => a + r.conversions, 0),
    }),
    [shown]
  );

  const toggleMetric = (key: string) =>
    setVisible((s) => {
      const n = new Set(s);
      if (n.has(key)) {
        if (n.size === 1) return n; // keep at least one column
        n.delete(key);
      } else n.add(key);
      return n;
    });

  const zeroHidden = accountId === "all" && !showZero ? rows.length - shown.length : 0;

  return (
    <div>
      {/* Filters: account + sort */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className={selectCls}
        >
          <option value="all">All Google Ads accounts</option>
          {rows.map((r) => (
            <option key={r.accountId} value={r.accountId}>
              {r.displayName} ({r.externalAccountId})
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span>Sort by</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className={selectCls}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            {dir === "desc" ? "Highest → Lowest" : "Lowest → Highest"}
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={showZero}
            onChange={(e) => setShowZero(e.target.checked)}
            disabled={accountId !== "all"}
          />
          Show accounts with no activity
        </label>
      </div>

      {/* Metric column toggles */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {METRICS.map((m) => {
          const on = visible.has(m.key);
          return (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                on
                  ? "border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900"
                  : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          No Google Ads activity in this period.
        </div>
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
              <tr>
                <th className={th}>Account</th>
                {cols.map((m) => (
                  <th key={m.key} className={`${th} text-right`}>
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.accountId} className="border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className={td}>
                    <Link
                      href={`/admin/ad-accounts/${r.accountId}`}
                      className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {r.displayName}
                    </Link>
                    <div className="text-[11px] text-zinc-400 font-mono">{r.externalAccountId}</div>
                  </td>
                  {cols.map((m) => (
                    <td key={m.key} className={`${td} text-right tabular-nums`}>
                      {m.value(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {shown.length > 1 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 font-semibold">
                  <td className={td}>{total.displayName}</td>
                  {cols.map((m) => (
                    <td key={m.key} className={`${td} text-right tabular-nums`}>
                      {m.value(total)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <p className="mt-2 text-xs text-zinc-400">
        Follows the date filter at the top of the page. Click an account to drill into its daily
        spend + campaigns.
        {zeroHidden > 0 && <> {zeroHidden} account(s) with no activity hidden.</>}
      </p>
    </div>
  );
}

const selectCls =
  "max-w-full min-w-0 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm";
const th = "px-4 py-2.5 font-medium text-xs uppercase tracking-wider";
const td = "px-4 py-2.5";
