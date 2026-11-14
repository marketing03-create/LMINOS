import Link from "next/link";
import { CompactDateFilter } from "@/components/compact-date-filter";
import { requireAdminPage } from "@/lib/auth/page-guard";
import { rangeFromParams, type RangeChoice } from "@/lib/date-range";
import { getSourceStats, SourceStatsError } from "@/lib/finance/source-stats";
import { pct, rm, type Leads, type Sales, type SourceStats } from "@/lib/finance/source-stats-core";

/**
 * Sales — approved loans and lead outcomes per marketing source, from the
 * Finance Connect Source Statistics API (lib/finance/source-stats.ts). Admin
 * only. Totals only: no customer, case or staff details exist in this data,
 * and referral partners' names are dropped before anything is stored.
 * Opens on this month; one API answer per date range covers every platform,
 * the platform chips just filter it.
 */

type SP = { range?: string; start?: string; end?: string; platform?: string };

const BASE = "/admin/sales";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function thisMonth(now = new Date()): RangeChoice {
  const today = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  return rangeFromParams({ start: `${today.slice(0, 8)}01`, end: today });
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const choice = sp.range
    ? rangeFromParams({ range: sp.range })
    : sp.start && sp.end && ISO.test(sp.start) && ISO.test(sp.end)
      ? rangeFromParams({ start: sp.start, end: sp.end })
      : thisMonth();
  // The API takes at most 366 days; "All time" is cut to the last 366.
  const from =
    Date.parse(choice.endStr) - Date.parse(choice.startStr) > 365 * 86_400_000
      ? new Date(Date.parse(choice.endStr) - 365 * 86_400_000).toISOString().slice(0, 10)
      : choice.startStr;

  let data: { stats: SourceStats; fetchedAt: Date; stale: boolean } | null = null;
  let error: string | null = null;
  try {
    data = await getSourceStats(from, choice.endStr);
  } catch (err) {
    error = err instanceof SourceStatsError ? err.message : "Sales couldn't load. Try again in a moment.";
    if (!(err instanceof SourceStatsError)) console.error("[sales] failed:", err instanceof Error ? err.name : "error");
  }

  const platform = sp.platform && data?.stats.platforms.some((p) => p.platform === sp.platform) ? sp.platform : "";
  const keep: Record<string, string> = platform ? { platform } : {};
  const dateQs =
    choice.mode === "custom" ? `start=${choice.startStr}&end=${choice.endStr}` : `range=${choice.presetKey}`;
  const chipHref = (p: string) => `${BASE}?${dateQs}${p ? `&platform=${p}` : ""}`;

  const line = platform ? data?.stats.platforms.find((p) => p.platform === platform) : null;
  const sales = line ? line.sales : data?.stats.totals.sales;
  const leads = line ? line.leads : data?.stats.totals.leads;
  const sources = data ? data.stats.sources.filter((s) => !platform || s.platform === platform) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:p-8">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Sales</h1>
        <CompactDateFilter basePath={BASE} choice={choice} extraParams={keep} />
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      {data && sales && (
        <>
          {data.stats.platforms.length > 1 && (
            <nav aria-label="Platform" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              <Chip href={chipHref("")} active={!platform} label="All" />
              {data.stats.platforms.map((p) => (
                <Chip key={p.platform} href={chipHref(p.platform)} active={platform === p.platform} label={p.label} />
              ))}
            </nav>
          )}

          <Tiles sales={sales} leads={leads ?? null} />

          {!platform && data.stats.platforms.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">By platform</h2>
              <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950">
                {data.stats.platforms.map((p) => (
                  <li key={p.platform}>
                    <Link
                      href={chipHref(p.platform)}
                      className="flex flex-col gap-1 px-4 py-3 active:bg-zinc-50 sm:flex-row sm:items-center sm:gap-4 lg:hover:bg-zinc-50 dark:active:bg-zinc-800 lg:dark:hover:bg-zinc-900"
                    >
                      <span className="font-medium sm:w-40">{p.label}</span>
                      <SalesLine sales={p.sales} />
                      <LeadsLine leads={p.leads} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Sources <span className="font-normal text-zinc-500">{sources.length}</span>
            </h2>
            {sources.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
                No sales or leads in this period.
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950">
                {sources.map((s) => (
                  <li key={`${s.platform}:${s.key}`} className="flex flex-col gap-1 px-4 py-3 lg:flex-row lg:items-center lg:gap-4">
                    <div className="min-w-0 lg:w-72">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="text-xs text-zinc-500">{s.typeLabel}</div>
                    </div>
                    <SalesLine sales={s.sales} />
                    <LeadsLine leads={s.leads} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-4 text-xs text-zinc-500">
            {data.stale ? "Finance Connect didn't answer · showing " : "Updated "}
            {new Intl.DateTimeFormat("en-MY", {
              timeZone: "Asia/Kuala_Lumpur",
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            }).format(data.fetchedAt)}
            {from !== choice.startStr && ` · from ${from}`}
          </p>
        </>
      )}
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-200 bg-white text-zinc-700 active:bg-zinc-50 lg:hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
      }`}
    >
      {label}
    </Link>
  );
}

function Tiles({ sales, leads }: { sales: Sales; leads: Leads | null }) {
  const items: { label: string; value: string; sub?: string; accent?: boolean }[] = [
    { label: "Approved loans", value: sales.count.toLocaleString("en-MY"), accent: true },
    { label: "Loan amount", value: rm(sales.amount) },
    {
      label: "New customers",
      value: sales.newCustomer.count.toLocaleString("en-MY"),
      sub: rm(sales.newCustomer.amount),
    },
    {
      label: "Returning",
      value: sales.returning.count.toLocaleString("en-MY"),
      sub: rm(sales.returning.amount),
    },
  ];
  if (leads) {
    items.push(
      { label: "Leads", value: leads.received.toLocaleString("en-MY"), sub: `${leads.open} open` },
      { label: "Lead conversion", value: pct(leads.conversion), sub: `${leads.approved} approved` }
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((i) => (
        <div
          key={i.label}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950"
        >
          <dt className="text-sm text-zinc-500 dark:text-zinc-400">{i.label}</dt>
          <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${i.accent ? "text-blue-600 dark:text-blue-400" : ""}`}>
            {i.value}
          </dd>
          {i.sub && <dd className="text-xs text-zinc-500 tabular-nums">{i.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

function SalesLine({ sales }: { sales: Sales }) {
  return (
    <div className="text-sm tabular-nums lg:w-56">
      <span className="font-semibold">{sales.count}</span> <span className="text-zinc-500">loans</span>
      <span className="text-zinc-400"> · </span>
      <span>{rm(sales.amount)}</span>
    </div>
  );
}

function LeadsLine({ leads }: { leads: Leads | null }) {
  if (!leads) return <div className="hidden text-sm text-zinc-400 lg:block lg:flex-1">—</div>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm tabular-nums text-zinc-600 dark:text-zinc-400 lg:flex-1">
      <span>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{leads.received}</span> leads
      </span>
      <span>{leads.open} open</span>
      {leads.pending > 0 && <span>{leads.pending} pending</span>}
      <span>{leads.approved} approved</span>
      {leads.rejected > 0 && <span>{leads.rejected} rejected</span>}
      {leads.lost > 0 && <span>{leads.lost} lost</span>}
      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{pct(leads.conversion)}</span>
    </div>
  );
}
