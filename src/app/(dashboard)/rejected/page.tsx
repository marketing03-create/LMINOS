import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";

type Tab = "all" | "recycle" | "resale";

type Row = {
  id: string;
  leadId: string;
  rejectedAt: Date;
  rejectionReason: string;
  recycleEligible: boolean;
  resaleEligible: boolean;
  nextAction: string;
  recycledAt: Date | null;
  snapshotLoanType: string | null;
  snapshotLocationRegion: string | null;
  snapshotSourcePlatform: string | null;
};

async function loadRows(tab: Tab): Promise<{
  rows: Row[];
  counts: { all: number; recycle: number; resale: number };
  byReason: { reason: string; n: number }[];
  error: string | null;
}> {
  try {
    const { db } = await import("@/db/client");
    const { rejectedLeads } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");

    const where =
      tab === "recycle"
        ? and(eq(rejectedLeads.recycleEligible, true), isNull(rejectedLeads.recycledAt))
        : tab === "resale"
          ? eq(rejectedLeads.resaleEligible, true)
          : undefined;

    const rows = (await db
      .select({
        id: rejectedLeads.id,
        leadId: rejectedLeads.leadId,
        rejectedAt: rejectedLeads.rejectedAt,
        rejectionReason: rejectedLeads.rejectionReason,
        recycleEligible: rejectedLeads.recycleEligible,
        resaleEligible: rejectedLeads.resaleEligible,
        nextAction: rejectedLeads.nextAction,
        recycledAt: rejectedLeads.recycledAt,
        snapshotLoanType: rejectedLeads.snapshotLoanType,
        snapshotLocationRegion: rejectedLeads.snapshotLocationRegion,
        snapshotSourcePlatform: rejectedLeads.snapshotSourcePlatform,
      })
      .from(rejectedLeads)
      .where(where)
      .orderBy(desc(rejectedLeads.rejectedAt))
      .limit(200)) as Row[];

    const allCount = await db.$count(rejectedLeads);
    const recycleCount = await db.$count(
      rejectedLeads,
      and(eq(rejectedLeads.recycleEligible, true), isNull(rejectedLeads.recycledAt))
    );
    const resaleCount = await db.$count(
      rejectedLeads,
      eq(rejectedLeads.resaleEligible, true)
    );

    const byReasonRows = await db
      .select({
        reason: rejectedLeads.rejectionReason,
        n: sql<number>`count(*)::int`,
      })
      .from(rejectedLeads)
      .groupBy(rejectedLeads.rejectionReason);

    return {
      rows,
      counts: { all: allCount, recycle: recycleCount, resale: resaleCount },
      byReason: byReasonRows
        .map((r) => ({ reason: String(r.reason), n: r.n }))
        .sort((a, b) => b.n - a.n),
      error: null,
    };
  } catch (err) {
    return {
      rows: [],
      counts: { all: 0, recycle: 0, resale: 0 },
      byReason: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function RejectedPoolPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab: Tab =
    sp.tab === "recycle" || sp.tab === "resale" ? sp.tab : "all";
  const { rows, counts, byReason, error } = await loadRows(tab);

  return (
    <div className="p-8 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Rejected pool</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Rejected leads are preserved here as a recycle/resale asset.
        </p>
      </header>

      <div className="flex gap-2 mb-6">
        <TabLink href="/rejected" current={tab} value="all" label="All" count={counts.all} />
        <TabLink
          href="/rejected?tab=recycle"
          current={tab}
          value="recycle"
          label="Recycle eligible"
          count={counts.recycle}
        />
        <TabLink
          href="/rejected?tab=resale"
          current={tab}
          value="resale"
          label="Resale eligible"
          count={counts.resale}
        />
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      {byReason.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          {byReason.map((b) => (
            <div
              key={b.reason}
              className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-white dark:bg-zinc-950"
            >
              <div className="text-xs text-zinc-500">{b.reason}</div>
              <div className="text-lg font-semibold tabular-nums">{b.n}</div>
            </div>
          ))}
        </div>
      )}

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>Rejected at</Th>
              <Th>Reason</Th>
              <Th>Loan</Th>
              <Th>Region</Th>
              <Th>Source</Th>
              <Th>Flags</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                  No rejected leads in this view.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <Td className="text-zinc-500 tabular-nums">
                  {new Date(r.rejectedAt).toLocaleString("en-MY", { hour12: false })}
                </Td>
                <Td className="font-mono text-xs">{r.rejectionReason}</Td>
                <Td>{r.snapshotLoanType ?? "—"}</Td>
                <Td>{r.snapshotLocationRegion ?? "—"}</Td>
                <Td>{r.snapshotSourcePlatform ?? "—"}</Td>
                <Td>
                  {r.recycleEligible && <Flag tone="emerald">recycle</Flag>}
                  {r.resaleEligible && <Flag tone="amber">resale</Flag>}
                  {r.recycledAt && <Flag tone="zinc">recycled</Flag>}
                </Td>
                <Td>
                  <Link
                    href={`/rejected/${r.id}`}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    open
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabLink({
  href,
  current,
  value,
  label,
  count,
}: {
  href: string;
  current: Tab;
  value: Tab;
  label: string;
  count: number;
}) {
  const active = current === value;
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md text-sm ${
        active
          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
          : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
      }`}
    >
      {label}{" "}
      <span className={`ml-1 text-xs ${active ? "opacity-80" : "text-zinc-500"}`}>
        {count}
      </span>
    </Link>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{children}</th>;
}
function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
}
function Flag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "emerald" | "amber" | "zinc";
}) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-300"
      : tone === "amber"
        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-300"
        : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400";
  return (
    <span className={`mr-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  );
}
