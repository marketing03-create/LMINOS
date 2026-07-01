import Link from "next/link";
import {
  adAccountSummaries,
  dateParamString,
  rangeFromParams,
  type AccountSummary,
} from "@/lib/ads/account-metrics";
import { fmtInt, fmtMyr, fmtMyr2, fmtPct2 } from "@/lib/roas/metrics";
import { DateFilter } from "@/components/date-filter";
import { RowActions } from "@/components/row-actions";
import { SyncNowButton } from "../integrations/sync-now-button";

async function load(range: { start: Date; end: Date }): Promise<{
  rows: AccountSummary[];
  byPlatform: Record<string, number>;
  error: string | null;
}> {
  try {
    const rows = await adAccountSummaries(range);
    const byPlatform: Record<string, number> = {};
    for (const r of rows) byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + 1;
    return { rows, byPlatform, error: null };
  } catch (err) {
    return {
      rows: [],
      byPlatform: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function AdminAdAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const choice = rangeFromParams(sp);
  const dateQs = dateParamString(choice);
  const { rows, byPlatform, error } = await load(choice.range);

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ad accounts</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Performance per account for the selected period. Click an account to
            drill into its daily spend and campaigns.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SyncNowButton variant="google" />
          <Link
            href="/admin/ad-accounts/bulk"
            className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 text-sm font-medium whitespace-nowrap"
          >
            Bulk import CSV
          </Link>
          <Link
            href="/admin/ad-accounts/authorize"
            className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 text-sm font-medium whitespace-nowrap"
          >
            Authorize Gmails
          </Link>
          <Link
            href="/admin/ad-accounts/add"
            className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 text-sm font-medium whitespace-nowrap"
          >
            + Add one
          </Link>
          <DateFilter basePath="/admin/ad-accounts" choice={choice} />
        </div>
      </header>
      <p className="-mt-3 mb-6 text-xs text-zinc-500">
        Auto-syncs daily. If the data looks stale, click <b>Sync Google Ads now</b>{" "}
        to pull the latest spend &amp; metrics immediately (takes ~20–40s).
      </p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {(["meta", "google", "tiktok"] as const).map((p) => (
          <div
            key={p}
            className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-white dark:bg-zinc-950"
          >
            <div className="text-xs uppercase tracking-wider text-zinc-500">{p}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {byPlatform[p] ?? 0}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>Account</Th>
              <Th className="text-right">Spend</Th>
              <Th className="text-right">Impr.</Th>
              <Th className="text-right">Clicks</Th>
              <Th className="text-right">CTR</Th>
              <Th className="text-right">Avg CPC</Th>
              <Th className="text-right">Conv.</Th>
              <Th className="text-right">Last synced</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-zinc-500">
                  No ad accounts yet.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const ctr = r.impressions > 0 ? r.clicks / r.impressions : null;
              const cpc = r.clicks > 0 ? r.spend / r.clicks : null;
              return (
                <tr
                  key={r.accountId}
                  className="border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/ad-accounts/${r.accountId}?${dateQs}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {r.displayName}
                    </Link>
                    <div className="text-[10px] font-mono text-zinc-500">
                      {r.platform} · {r.externalAccountId}
                      {r.isActive ? "" : " · inactive"}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                    {fmtMyr(r.spend)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                    {fmtInt(r.impressions)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                    {fmtInt(r.clicks)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                    {fmtPct2(ctr)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {fmtMyr2(cpc)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {fmtInt(r.conversions)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500 tabular-nums text-xs">
                    {r.lastSyncedAt
                      ? new Date(r.lastSyncedAt).toLocaleString("en-MY", {
                          hour12: false,
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <RowActions
                      editHref={`/admin/ad-accounts/${r.accountId}/edit`}
                      deleteUrl={`/api/ad-accounts/${r.accountId}`}
                      confirmLabel={`Delete account "${r.displayName}" and ALL its data (spend, campaigns, keywords)? This cannot be undone.`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-2.5 font-medium text-xs uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}
