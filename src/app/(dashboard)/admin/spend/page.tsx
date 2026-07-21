import Link from "next/link";
import {
  adAccountSummaries,
  dateParamString,
  rangeFromParams,
  type AccountSummary,
} from "@/lib/ads/account-metrics";
import { fmtInt, fmtMyr } from "@/lib/roas/metrics";
import { DateFilter } from "@/components/date-filter";
import { SpendUploadForm } from "./upload-form";

async function load(range: { start: Date; end: Date }): Promise<{
  rows: AccountSummary[];
  error: string | null;
}> {
  try {
    return { rows: await adAccountSummaries(range), error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function SpendAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const choice = rangeFromParams(sp);
  const dateQs = dateParamString(choice);
  const { rows, error } = await load(choice.range);

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Ad spend uploads</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Google accounts auto-sync daily via the API. For other platforms,
          upload a CSV — columns: <code>platform, ad_account_id, campaign_id,
          date, spend</code>; optional <code>impressions, clicks, conversions,
          leads</code>. Re-uploads overwrite by
          (platform·account·campaign·ad_set·ad·date).
        </p>
      </header>

      <SpendUploadForm />

      <div className="mt-10 mb-4 flex items-end justify-between gap-4 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Spend by ad account
        </h2>
        <DateFilter basePath="/admin/spend" choice={choice} />
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>Ad account</Th>
              <Th className="text-right">Spend</Th>
              <Th className="text-right">Impr.</Th>
              <Th className="text-right">Clicks</Th>
              <Th className="text-right">Conv.</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                  No ad accounts yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
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
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {fmtInt(r.conversions)}
                </td>
              </tr>
            ))}
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
