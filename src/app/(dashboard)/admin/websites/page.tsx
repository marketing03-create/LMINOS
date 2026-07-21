import Link from "next/link";
import { rangeFromParams, dateParamString } from "@/lib/ads/account-metrics";
import { websiteSummaries, type WebsiteSummary } from "@/lib/ads/website-metrics";
import { fmtInt, fmtMyr } from "@/lib/roas/metrics";
import { DateFilter } from "@/components/date-filter";
import { RowActions } from "@/components/row-actions";
import { AddWebsite } from "./add-website";

export default async function AdminWebsitesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const choice = rangeFromParams(sp);
  const qs = dateParamString(choice);

  let rows: WebsiteSummary[] = [];
  let error: string | null = null;
  try {
    rows = await websiteSummaries(choice.range);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Websites</h1>
          <p className="mt-1 text-sm text-zinc-500">
            The stable hub for each site: its (rotating) ad accounts, agent pool,
            and performance. Spend & revenue aggregate by slug, so ROAS stays
            continuous when an account is suspended and replaced.
          </p>
        </div>
        <DateFilter basePath="/admin/websites" choice={choice} />
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      <div className="mb-6">
        <AddWebsite />
      </div>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>Website</Th>
              <Th className="text-right">Agents</Th>
              <Th className="text-right">Accounts</Th>
              <Th className="text-right">Spend</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">Approved</Th>
              <Th className="text-right">Revenue</Th>
              <Th className="text-right">Real ROAS</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-zinc-500">
                  No websites yet. Add one above, or run{" "}
                  <code className="text-xs">npm run backfill:websites</code>.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <Td>
                  <Link
                    href={`/admin/websites/${r.id}?${qs}`}
                    className="text-zinc-900 dark:text-zinc-100 hover:underline font-medium"
                  >
                    {r.name}
                  </Link>
                  <div className="text-xs text-zinc-500 font-mono">{r.slug}</div>
                </Td>
                <Td className="text-right tabular-nums">{r.agentCount}</Td>
                <Td className="text-right tabular-nums">
                  {r.activeAccounts}
                  {r.suspendedAccounts > 0 && (
                    <span className="text-amber-500" title="suspended/replaced">
                      {" "}
                      (+{r.suspendedAccounts})
                    </span>
                  )}
                </Td>
                <Td className="text-right tabular-nums">{fmtMyr(r.spend)}</Td>
                <Td className="text-right tabular-nums">{fmtInt(r.leads)}</Td>
                <Td className="text-right tabular-nums">{fmtInt(r.approved)}</Td>
                <Td className="text-right tabular-nums">{fmtMyr(r.revenue)}</Td>
                <Td className="text-right tabular-nums font-medium">
                  {r.realRoas == null ? "—" : `${r.realRoas.toFixed(2)}×`}
                </Td>
                <Td>
                  <StatusBadge active={r.isActive} status={r.status} />
                </Td>
                <Td className="text-right">
                  <RowActions
                    editHref={`/admin/websites/${r.id}?${qs}`}
                    deleteUrl={`/api/websites/${r.id}`}
                    confirmLabel={`Delete website "${r.name}"? Its agent pool is removed; ad accounts keep their data but lose the website link.`}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ active, status }: { active: boolean; status: string }) {
  if (!active)
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
        inactive
      </span>
    );
  if (status === "paused")
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
        paused
      </span>
    );
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
      active
    </span>
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
