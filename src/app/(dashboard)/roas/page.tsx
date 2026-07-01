import Link from "next/link";
import {
  aggregateByDimension,
  topLineMetrics,
  type Dimension,
} from "@/lib/roas/aggregate";
import {
  fmtInt,
  fmtMyr,
  fmtMyr2,
  fmtPct2,
  fmtRoas,
} from "@/lib/roas/metrics";
import { dateParamString, rangeFromParams } from "@/lib/ads/account-metrics";
import { DateFilter } from "@/components/date-filter";

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "website", label: "Website" },
  { key: "agent", label: "Agent" },
  { key: "platform", label: "Platform" },
  { key: "brand", label: "Brand" },
  { key: "campaign", label: "Campaign" },
  { key: "ad_set", label: "Ad set" },
  { key: "ad", label: "Ad" },
  { key: "source_platform", label: "Source" },
  { key: "loan_type", label: "Loan type" },
];

export default async function RoasPage({
  searchParams,
}: {
  searchParams: Promise<{
    by?: string;
    range?: string;
    start?: string;
    end?: string;
  }>;
}) {
  const sp = await searchParams;
  const dimension: Dimension =
    DIMENSIONS.find((d) => d.key === sp.by)?.key ?? "website";
  const choice = rangeFromParams(sp);
  const range = choice.range;
  const dateQs = dateParamString(choice);

  let topline: Awaited<ReturnType<typeof topLineMetrics>> | null = null;
  let rows: Awaited<ReturnType<typeof aggregateByDimension>> = [];
  let error: string | null = null;
  try {
    topline = await topLineMetrics(range);
    rows = await aggregateByDimension(dimension, range);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="p-8 max-w-7xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Real ROAS</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Ad performance + lead quality. <b>Conv.</b> = platform-reported
            conversions; <b>Quality</b> = real approved sales ÷ platform conv.
            ROAS uses real approved-sales revenue, not platform conversions.
          </p>
        </div>
        <DateFilter basePath="/roas" choice={choice} extra={{ by: dimension }} />
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      {topline && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <Kpi label="Leads" value={topline.leads.toLocaleString()} />
          <Kpi label="Approved" value={(topline.approved + topline.closed).toLocaleString()} />
          <Kpi label="Spend" value={fmtMyr(topline.spend)} />
          <Kpi label="Revenue" value={fmtMyr(topline.revenue)} accent="emerald" />
          <Kpi label="Real ROAS" value={fmtRoas(topline.realRoas)} accent="emerald" big />
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-4 text-sm">
        <span className="text-zinc-500 self-center mr-2">Break down by:</span>
        {DIMENSIONS.map((d) => (
          <Link
            key={d.key}
            href={`/roas?by=${d.key}&${dateQs}`}
            className={`px-3 py-1.5 rounded-md ${
              d.key === dimension
                ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {d.label}
          </Link>
        ))}
      </div>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>{DIMENSIONS.find((d) => d.key === dimension)?.label}</Th>
              <Th className="text-right">Impr.</Th>
              <Th className="text-right">Clicks</Th>
              <Th className="text-right">CTR</Th>
              <Th className="text-right">Spend</Th>
              <Th className="text-right">Avg CPC</Th>
              <Th className="text-right">Conv.</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">Approved</Th>
              <Th className="text-right">Quality</Th>
              <Th className="text-right">Revenue</Th>
              <Th className="text-right">Real ROAS</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-zinc-500">
                  No data in this slice. Connect Google Ads (auto-sync) and record sales.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.key}
                className="border-t border-zinc-100 dark:border-zinc-900"
              >
                <td className="px-4 py-2.5">
                  {r.label}
                  <SignalBadge m={r.metrics} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                  {fmtInt(r.metrics.impressions)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                  {fmtInt(r.metrics.clicks)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                  {fmtPct2(r.metrics.ctr)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {fmtMyr(r.metrics.spend)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {fmtMyr2(r.metrics.avgCpc)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {fmtInt(r.metrics.platformConversions)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {r.metrics.leads.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {(r.metrics.approved + r.metrics.closed).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <QualityCell value={r.metrics.leadQuality} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {fmtMyr(r.metrics.revenue)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                  <RoasCell value={r.metrics.realRoas} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  big,
}: {
  label: string;
  value: string;
  accent?: "emerald";
  big?: boolean;
}) {
  const color =
    accent === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "";
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-white dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div
        className={`mt-1 ${big ? "text-2xl" : "text-xl"} font-semibold tabular-nums ${color}`}
      >
        {value}
      </div>
    </div>
  );
}

function RoasCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-500">—</span>;
  const tone =
    value >= 3
      ? "text-emerald-600 dark:text-emerald-400"
      : value >= 1
        ? "text-zinc-900 dark:text-zinc-100"
        : "text-rose-600 dark:text-rose-400";
  return <span className={tone}>{fmtRoas(value)}</span>;
}

/**
 * Lead quality = real approved sales ÷ platform-reported conversions.
 * High = the platform's "conversions" actually turn into approved loans.
 * Low = the ads report lots of conversions that don't become real sales.
 */
function QualityCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-500">—</span>;
  const tone =
    value >= 0.5
      ? "text-emerald-600 dark:text-emerald-400"
      : value >= 0.2
        ? "text-amber-600 dark:text-amber-400"
        : "text-rose-600 dark:text-rose-400";
  return <span className={tone}>{fmtPct2(value)}</span>;
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

/**
 * Conservative action hint. We only "Scale" on strong real ROAS and only flag
 * "Review" when there's meaningful spend and weak return — and a separate
 * "Low quality" when the platform reports lots of conversions but few become
 * real approved sales. Needs ≥ RM 50 spend to say anything.
 */
function SignalBadge({
  m,
}: {
  m: { spend: number; realRoas: number | null; leadQuality: number | null; platformConversions: number };
}) {
  if (m.spend < 50) return null;
  let text: string | null = null;
  let cls = "";
  let title = "";
  if (m.realRoas != null && m.realRoas >= 3) {
    text = "Scale ↑";
    cls = "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300";
    title = `Strong return (ROAS ${m.realRoas}×) — consider increasing budget.`;
  } else if (m.realRoas != null && m.realRoas < 1) {
    text = "Review ↓";
    cls = "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300";
    title = `Spending more than recorded revenue (ROAS ${m.realRoas}×). Check the campaign — or whether sales are being recorded.`;
  } else if (m.leadQuality != null && m.leadQuality < 0.1 && m.platformConversions >= 10) {
    text = "Low quality";
    cls = "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300";
    title = `Platform reports many conversions but few become approved loans (${fmtPct2(m.leadQuality)}).`;
  }
  if (!text) return null;
  return (
    <span
      title={title}
      className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium align-middle ${cls}`}
    >
      {text}
    </span>
  );
}
