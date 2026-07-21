import Link from "next/link";
import { notFound } from "next/navigation";
import {
  accountKeywords,
  accountWastedSearchTerms,
  adAccountById,
  adAccountCampaigns,
  adAccountDaily,
  rangeFromParams,
  type CampaignMetricRow,
  type DailyMetricRow,
  type KeywordRow,
  type WastedTermRow,
} from "@/lib/ads/account-metrics";
import { fmtInt, fmtMyr, fmtMyr2, fmtPct2 } from "@/lib/roas/metrics";
import { DateFilter } from "@/components/date-filter";

export default async function AdAccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const choice = rangeFromParams(sp);

  let account: Awaited<ReturnType<typeof adAccountById>> = undefined;
  let daily: DailyMetricRow[] = [];
  let camps: CampaignMetricRow[] = [];
  let keywords: KeywordRow[] = [];
  let wasted: WastedTermRow[] = [];
  let error: string | null = null;
  try {
    account = await adAccountById(id);
    if (account) {
      daily = await adAccountDaily(id, choice.range);
      camps = await adAccountCampaigns(id, choice.range);
      keywords = await accountKeywords(id, choice.range, 50);
      wasted = await accountWastedSearchTerms(id, choice.range, 50);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  if (!account && !error) notFound();

  const tot = daily.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      conversions: a.conversions + r.conversions,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );
  const ctr = tot.impressions > 0 ? tot.clicks / tot.impressions : null;
  const cpc = tot.clicks > 0 ? tot.spend / tot.clicks : null;

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <Link
        href="/admin/ad-accounts"
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        ← All ad accounts
      </Link>

      <header className="mt-3 mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {account?.displayName ?? "Ad account"}
          </h1>
          <p className="mt-1 text-xs font-mono text-zinc-500">
            {account?.platform} · {account?.externalAccountId}
            {account?.website ? ` · ${account.website}` : ""}
          </p>
        </div>
        <DateFilter basePath={`/admin/ad-accounts/${id}`} choice={choice} />
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-8">
        <Kpi label="Spend" value={fmtMyr(tot.spend)} />
        <Kpi label="Impr." value={fmtInt(tot.impressions)} />
        <Kpi label="Clicks" value={fmtInt(tot.clicks)} />
        <Kpi label="CTR" value={fmtPct2(ctr)} />
        <Kpi label="Avg CPC" value={fmtMyr2(cpc)} />
        <Kpi label="Conv." value={fmtInt(tot.conversions)} />
      </div>

      {/* Daily breakdown — the main table, shown first. */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
        Daily breakdown
      </h2>
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto mb-8">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>Date</Th>
              <Th className="text-right">Impr.</Th>
              <Th className="text-right">Clicks</Th>
              <Th className="text-right">CTR</Th>
              <Th className="text-right">Spend</Th>
              <Th className="text-right">Avg CPC</Th>
              <Th className="text-right">Conv.</Th>
            </tr>
          </thead>
          <tbody>
            {daily.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                  No spend in this period.
                </td>
              </tr>
            )}
            {daily.map((r) => {
              const rc = r.impressions > 0 ? r.clicks / r.impressions : null;
              const rp = r.clicks > 0 ? r.spend / r.clicks : null;
              return (
                <tr key={r.date} className="border-t border-zinc-100 dark:border-zinc-900">
                  <td className="px-4 py-2.5 tabular-nums">{r.date}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{fmtInt(r.impressions)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{fmtInt(r.clicks)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{fmtPct2(rc)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmtMyr(r.spend)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMyr2(rp)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(r.conversions)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Campaigns — always shown (empty state when none) for a consistent layout. */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
        Campaigns
      </h2>
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto mb-8">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>Campaign</Th>
              <Th className="text-right">Spend</Th>
              <Th className="text-right">Impr.</Th>
              <Th className="text-right">Clicks</Th>
              <Th className="text-right">Conv.</Th>
            </tr>
          </thead>
          <tbody>
            {camps.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No campaign spend in this period.
                </td>
              </tr>
            )}
            {camps.map((c) => (
              <tr key={c.name} className="border-t border-zinc-100 dark:border-zinc-900">
                <td className="px-4 py-2.5">{c.name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMyr(c.spend)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{fmtInt(c.impressions)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{fmtInt(c.clicks)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(c.conversions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top keywords — always shown. */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
        Top keywords
      </h2>
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto mb-8">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>Keyword</Th>
              <Th>Match</Th>
              <Th className="text-right">Spend</Th>
              <Th className="text-right">Clicks</Th>
              <Th className="text-right">CTR</Th>
              <Th className="text-right">Conv.</Th>
            </tr>
          </thead>
          <tbody>
            {keywords.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No keyword data yet. Keyword stats sync separately — run{" "}
                  <code className="text-xs">npm run gads:sync-keywords</code> or wait
                  for the daily keyword cron.
                </td>
              </tr>
            )}
            {keywords.map((k, i) => {
              const ctr = k.impressions > 0 ? k.clicks / k.impressions : null;
              return (
                <tr key={`${k.keywordText}-${i}`} className="border-t border-zinc-100 dark:border-zinc-900">
                  <td className="px-4 py-2.5">{k.keywordText}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500">
                    {(k.matchType ?? "").toLowerCase()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMyr(k.spend)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{fmtInt(k.clicks)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{fmtPct2(ctr)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(k.conversions)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Wasted spend — always shown. */}
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-zinc-500">
        Wasted spend — search terms with 0 conversions
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Prime negative-keyword candidates: real queries that cost money but
        converted nothing in this period.
      </p>
      <div className="border border-amber-200 dark:border-amber-900/50 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>Search term</Th>
              <Th>Campaign</Th>
              <Th className="text-right">Spend</Th>
              <Th className="text-right">Clicks</Th>
              <Th className="text-right">Impr.</Th>
            </tr>
          </thead>
          <tbody>
            {wasted.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No wasted search terms in this period (or keyword data not synced yet).
                </td>
              </tr>
            )}
            {wasted.map((w, i) => (
              <tr key={`${w.term}-${i}`} className="border-t border-zinc-100 dark:border-zinc-900">
                <td className="px-4 py-2.5">{w.term}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-500">{w.campaignName ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-amber-700 dark:text-amber-400">
                  {fmtMyr(w.spend)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{fmtInt(w.clicks)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{fmtInt(w.impressions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-white dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
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
