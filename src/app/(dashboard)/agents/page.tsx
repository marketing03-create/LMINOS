import { eq, isNotNull, sql } from "drizzle-orm";
import Link from "next/link";

type Row = {
  id: string;
  email: string;
  fullName: string | null;
  teamName: string | null;
  dealsClosed: number;
  totalRecords: number;
  revenueMyr: number;
};

async function load(): Promise<{ rows: Row[]; error: string | null }> {
  try {
    const { db } = await import("@/db/client");
    const { users, teams, salesRecords } = await import("@/db/schema");

    const agents = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        teamName: teams.name,
      })
      .from(users)
      .leftJoin(teams, eq(teams.id, users.teamId))
      .where(eq(users.role, "sales_agent"));

    // Credit by the CLOSING agent (shared-pool model): aggregate sales_records
    // by agentId, not leads.assignedAgentId (which is now null/pool-owned).
    const agg = await db
      .select({
        agentId: salesRecords.agentId,
        dealsClosed: sql<number>`sum(case when ${salesRecords.salesStatus} in ('approved','closed') then 1 else 0 end)::int`,
        revenue: sql<number>`coalesce(sum(case when ${salesRecords.salesStatus} in ('approved','closed') then ${salesRecords.revenueValue} else 0 end),0)::float`,
        total: sql<number>`count(*)::int`,
      })
      .from(salesRecords)
      .where(isNotNull(salesRecords.agentId))
      .groupBy(salesRecords.agentId);
    const byAgent = new Map(agg.map((r) => [r.agentId, r]));

    const rows: Row[] = agents.map((a) => {
      const m = byAgent.get(a.id);
      return {
        id: a.id,
        email: a.email,
        fullName: a.fullName,
        teamName: a.teamName,
        dealsClosed: Number(m?.dealsClosed ?? 0),
        totalRecords: Number(m?.total ?? 0),
        revenueMyr: Number(m?.revenue ?? 0),
      };
    });

    rows.sort((x, y) => y.revenueMyr - x.revenueMyr);
    return { rows, error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function AgentsLeaderboardPage() {
  const { rows, error } = await load();

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Agent performance</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Credited to the agent who <b>closes</b> the sale (shared-pool model).
          Leads belong to each website's pool, not a single owner — see a website's
          pool on <Link href="/admin/websites" className="underline">Websites</Link>.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>Agent</Th>
              <Th>Team</Th>
              <Th className="text-right">Deals closed</Th>
              <Th className="text-right">Sales records</Th>
              <Th className="text-right">Avg deal</Th>
              <Th className="text-right">Revenue</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                  No sales agents yet. Seed users via admin or DB.
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
                    href={`/agents/${r.id}`}
                    className="text-zinc-900 dark:text-zinc-100 hover:underline"
                  >
                    {r.fullName ?? r.email}
                  </Link>
                  <div className="text-xs text-zinc-500">{r.email}</div>
                </Td>
                <Td>{r.teamName ?? "—"}</Td>
                <Td className="text-right tabular-nums">{r.dealsClosed}</Td>
                <Td className="text-right tabular-nums">{r.totalRecords}</Td>
                <Td className="text-right tabular-nums">
                  {r.dealsClosed > 0
                    ? `RM ${Math.round(r.revenueMyr / r.dealsClosed).toLocaleString()}`
                    : "—"}
                </Td>
                <Td className="text-right tabular-nums font-medium">
                  RM {r.revenueMyr.toLocaleString()}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
