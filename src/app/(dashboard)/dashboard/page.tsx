import Link from "next/link";
import { adAccountSummaries, rangeFromParams } from "@/lib/ads/account-metrics";
import {
  aggregateByDimension,
  defaultRange,
  topLineMetrics,
  type DimensionRow,
} from "@/lib/roas/aggregate";
import { dailyTrends, type TrendPoint } from "@/lib/roas/trends";
import { hourlyHeatmap, type HeatCell } from "@/lib/roas/hourly";
import {
  fmtInt,
  fmtMyr,
  fmtMyr2,
  fmtPct2,
  fmtRoas,
  type Metrics,
} from "@/lib/roas/metrics";
import { DateFilter } from "@/components/date-filter";
import { TrendsCharts } from "./trends-charts";
import { HourlyHeatmap } from "./hourly-heatmap";
import { GadsTable, type GadsRow } from "./gads-table";
import { SyncNowButton } from "../admin/integrations/sync-now-button";

/**
 * Overview = the all-in-one dashboard (Feature S): KPI cards, top performers,
 * website + agent rankings, the trend charts, and the golden-hour heatmap —
 * all driven by one date filter. Absorbs the former /trends page.
 */

async function safe<T>(p: Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await p, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Sales conversion = confirmed sales ÷ leads (NOT approvalRate, which divides
 * by dispositioned outcomes only and reads misleadingly high while leads are
 * still pending). */
function convRate(m: Metrics): number | null {
  return m.leads > 0 ? (m.approved + m.closed) / m.leads : null;
}

/** Top website by ROAS among rows with meaningful spend (≥10% of total spend in
 * range — guards against tiny-spend ROAS outliers); falls back to top revenue. */
function topWebsite(rows: DimensionRow[]): DimensionRow | null {
  if (!rows.length) return null;
  const totalSpend = rows.reduce((a, r) => a + r.metrics.spend, 0);
  const qualified = rows.filter(
    (r) => r.metrics.realRoas != null && r.metrics.spend >= totalSpend * 0.1
  );
  if (qualified.length) {
    return qualified.reduce((best, r) =>
      (r.metrics.realRoas ?? 0) > (best.metrics.realRoas ?? 0) ? r : best
    );
  }
  return rows.reduce((best, r) => (r.metrics.revenue > best.metrics.revenue ? r : best));
}

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const choice = rangeFromParams(sp);

  const [today, topline, websites, agents, trends, heat, accounts] = await Promise.all([
    safe(topLineMetrics(defaultRange(1))),
    safe(topLineMetrics(choice.range)),
    safe(aggregateByDimension("website", choice.range, 50)),
    safe(aggregateByDimension("agent", choice.range, 50)),
    safe(dailyTrends(choice.range)),
    safe(hourlyHeatmap(choice.range)),
    safe(adAccountSummaries(choice.range)),
  ]);
  const error =
    today.error ??
    topline.error ??
    websites.error ??
    agents.error ??
    trends.error ??
    heat.error ??
    accounts.error;

  const m = topline.data;
  const websiteRows = websites.data ?? [];
  // Agent dim carries no spend (ROAS always null) → rank closers by revenue.
  const agentRows = [...(agents.data ?? [])].sort(
    (a, b) => b.metrics.revenue - a.metrics.revenue
  );
  const bestSite = topWebsite(websiteRows);
  const bestAgent = agentRows[0] ?? null;
  const trendData: TrendPoint[] = trends.data ?? [];
  const heatCells: HeatCell[] = heat.data ?? [];
  const gadsRows: GadsRow[] = (accounts.data ?? [])
    .filter((a) => a.platform === "google")
    .map((a) => ({
      accountId: a.accountId,
      displayName: a.displayName,
      externalAccountId: a.externalAccountId,
      spend: a.spend,
      impressions: a.impressions,
      clicks: a.clicks,
      conversions: a.conversions,
    }));

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-zinc-500">
            The whole business on one screen — KPIs, top performers, rankings,
            trends and your best hours. Filter applies to everything below.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <SyncNowButton variant="google" />
          <DateFilter basePath="/dashboard" choice={choice} />
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      {/* Today (always today, independent of the filter) */}
      {today.data && (
        <section className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Today so far</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniKpi label="Leads" value={fmtInt(today.data.leads)} />
            <MiniKpi label="Sales" value={fmtInt(today.data.approved + today.data.closed)} />
            <MiniKpi label="Revenue" value={fmtMyr(today.data.revenue)} accent />
            <MiniKpi label="Real ROAS" value={fmtRoas(today.data.realRoas)} accent />
          </div>
        </section>
      )}

      {/* Main KPI row for the selected range */}
      {m && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
            {choice.label}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Kpi label="Leads" value={fmtInt(m.leads)} />
            <Kpi label="Sales" value={fmtInt(m.approved + m.closed)} />
            <Kpi label="Revenue" value={fmtMyr(m.revenue)} accent />
            <Kpi label="Ad spend" value={fmtMyr(m.spend)} />
            <Kpi label="Avg ROAS" value={fmtRoas(m.realRoas)} accent />
            <Kpi label="Avg cost/lead" value={fmtMyr2(m.cpl)} />
            <Kpi label="Conv rate" value={fmtPct2(convRate(m))} />
          </div>
        </section>
      )}

      {/* Top performers */}
      {(bestSite || bestAgent) && (
        <section className="mb-8 grid md:grid-cols-2 gap-3">
          {bestSite && (
            <TopCard
              title="Top performance website"
              name={bestSite.label}
              lines={[
                `ROAS ${fmtRoas(bestSite.metrics.realRoas)}`,
                `Revenue ${fmtMyr(bestSite.metrics.revenue)} · Spend ${fmtMyr(bestSite.metrics.spend)}`,
              ]}
            />
          )}
          {bestAgent && (
            <TopCard
              title="Top performance agent"
              name={bestAgent.label}
              lines={[
                `Revenue ${fmtMyr(bestAgent.metrics.revenue)}`,
                `${fmtInt(bestAgent.metrics.approved + bestAgent.metrics.closed)} sales closed`,
              ]}
            />
          )}
        </section>
      )}

      {/* Google Ads per-account performance */}
      {gadsRows.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
            Google Ads performance — {choice.label}
          </h2>
          <GadsTable rows={gadsRows} />
        </section>
      )}

      {/* Website ranking */}
      {websiteRows.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
            Website ranking — {choice.label}
          </h2>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
                <tr>
                  <Th>#</Th>
                  <Th>Website</Th>
                  <Th className="text-right">Leads</Th>
                  <Th className="text-right">Sales</Th>
                  <Th className="text-right">Revenue</Th>
                  <Th className="text-right">Spend</Th>
                  <Th className="text-right">Cost/lead</Th>
                  <Th className="text-right">Conv rate</Th>
                  <Th className="text-right">ROAS</Th>
                </tr>
              </thead>
              <tbody>
                {websiteRows.map((r, i) => (
                  <tr key={r.key} className="border-t border-zinc-100 dark:border-zinc-900">
                    <Td className="text-xs text-zinc-400 tabular-nums">{i + 1}</Td>
                    <Td className="font-medium">{r.label}</Td>
                    <Td className="text-right tabular-nums">{fmtInt(r.metrics.leads)}</Td>
                    <Td className="text-right tabular-nums">
                      {fmtInt(r.metrics.approved + r.metrics.closed)}
                    </Td>
                    <Td className="text-right tabular-nums">{fmtMyr(r.metrics.revenue)}</Td>
                    <Td className="text-right tabular-nums text-zinc-500">
                      {fmtMyr(r.metrics.spend)}
                    </Td>
                    <Td className="text-right tabular-nums text-zinc-500">
                      {fmtMyr2(r.metrics.cpl)}
                    </Td>
                    <Td className="text-right tabular-nums text-zinc-500">
                      {fmtPct2(convRate(r.metrics))}
                    </Td>
                    <Td className="text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                      {fmtRoas(r.metrics.realRoas)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Same numbers as <Link href="/roas?by=website" className="underline">Real ROAS → Website</Link>,
            ranked by ROAS (best first).
          </p>
        </section>
      )}

      {/* Agent ranking */}
      {agentRows.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
            Agent ranking — {choice.label}
          </h2>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
                <tr>
                  <Th>#</Th>
                  <Th>Agent</Th>
                  <Th className="text-right">Sales</Th>
                  <Th className="text-right">Revenue</Th>
                </tr>
              </thead>
              <tbody>
                {agentRows.map((r, i) => (
                  <tr key={r.key} className="border-t border-zinc-100 dark:border-zinc-900">
                    <Td className="text-xs text-zinc-400 tabular-nums">{i + 1}</Td>
                    <Td className="font-medium">{r.label}</Td>
                    <Td className="text-right tabular-nums">
                      {fmtInt(r.metrics.approved + r.metrics.closed)}
                    </Td>
                    <Td className="text-right tabular-nums">{fmtMyr(r.metrics.revenue)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Revenue is credited to the agent who closed each sale. Full detail on{" "}
            <Link href="/agents" className="underline">Agents</Link>.
          </p>
        </section>
      )}

      {/* Trends over time */}
      {trendData.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
            Trends — {choice.label}
          </h2>
          <TrendsCharts data={trendData} />
        </section>
      ) : (
        !error && (
          <div className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl p-10 text-center text-zinc-500">
            No trend data in this period.
          </div>
        )
      )}

      {/* Golden hour */}
      {!error && heatCells.length > 0 && (
        <section className="mb-8">
          <HourlyHeatmap cells={heatCells} />
        </section>
      )}

      <div className="mt-6 flex gap-3 flex-wrap">
        <Link
          href="/roas"
          className="text-sm rounded-md px-4 py-2 bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 hover:opacity-90"
        >
          Open Real ROAS dashboard →
        </Link>
        <Link
          href="/admin/spend"
          className="text-sm rounded-md px-4 py-2 bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
        >
          Upload weekly spend CSV
        </Link>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-white dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          accent ? "text-emerald-600 dark:text-emerald-400" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function MiniKpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-white dark:bg-zinc-950">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          accent ? "text-emerald-600 dark:text-emerald-400" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function TopCard({ title, name, lines }: { title: string; name: string; lines: string[] }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-white dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{title}</div>
      <div className="mt-1 text-xl font-semibold text-amber-600 dark:text-amber-400 truncate">
        {name}
      </div>
      {lines.map((l) => (
        <div key={l} className="mt-0.5 text-xs text-zinc-500">
          {l}
        </div>
      ))}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2.5 font-medium text-xs uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
}
