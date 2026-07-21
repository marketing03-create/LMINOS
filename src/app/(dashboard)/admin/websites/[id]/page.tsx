import Link from "next/link";
import { notFound } from "next/navigation";
import { rangeFromParams, dateParamString } from "@/lib/ads/account-metrics";
import {
  allSalesAgents,
  websiteAccounts,
  websiteAgentPool,
  websiteById,
  websiteSummaries,
} from "@/lib/ads/website-metrics";
import { fmtInt, fmtMyr } from "@/lib/roas/metrics";
import { DateFilter } from "@/components/date-filter";
import { WebsiteDetailClient } from "./website-detail-client";

export default async function WebsiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const choice = rangeFromParams(sp);
  const qs = dateParamString(choice);

  const site = await websiteById(id);
  if (!site) notFound();

  const [accounts, pool, agents, summaries] = await Promise.all([
    websiteAccounts(site.id, site.slug),
    websiteAgentPool(site.id),
    allSalesAgents(),
    websiteSummaries(choice.range),
  ]);
  const summary = summaries.find((s) => s.id === site.id);

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Link href={`/admin/websites?${qs}`} className="text-xs text-zinc-500 hover:underline">
            ← All websites
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{site.name}</h1>
          <p className="mt-1 text-sm text-zinc-500 font-mono">{site.slug}</p>
        </div>
        <DateFilter basePath={`/admin/websites/${site.id}`} choice={choice} />
      </header>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-8">
          <Kpi label="Spend" value={fmtMyr(summary.spend)} />
          <Kpi label="Leads" value={fmtInt(summary.leads)} />
          <Kpi label="Approved" value={fmtInt(summary.approved)} />
          <Kpi label="Revenue" value={fmtMyr(summary.revenue)} />
          <Kpi
            label="Real ROAS"
            value={summary.realRoas == null ? "—" : `${summary.realRoas.toFixed(2)}×`}
          />
          <Kpi label="Clicks" value={fmtInt(summary.clicks)} />
        </div>
      )}

      <WebsiteDetailClient
        website={{
          id: site.id,
          name: site.name,
          slug: site.slug,
          status: site.status,
          isActive: site.isActive,
          whatsappNumber: site.whatsappNumber,
          notes: site.notes,
        }}
        accounts={accounts}
        pool={pool}
        allAgents={agents}
      />
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
