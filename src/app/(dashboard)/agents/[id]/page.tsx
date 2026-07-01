import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

type RecentSale = {
  id: string;
  leadId: string | null;
  leadName: string | null;
  status: string | null;
  revenue: number | null;
  syncedAt: Date;
};

type AgentDetail = {
  id: string;
  email: string;
  fullName: string | null;
  teamName: string | null;
  isActive: boolean;
  dailyCapacity: number;
  dealsClosed: number;
  totalRecords: number;
  revenueMyr: number;
  pools: { id: string; name: string; slug: string }[];
  recentSales: RecentSale[];
};

const CLOSED_LIKE = new Set(["approved", "closed"]);

async function load(id: string): Promise<{ agent: AgentDetail | null; error: string | null }> {
  try {
    const { db } = await import("@/db/client");
    const { users, teams, leads, salesRecords, websiteAgents, websites } =
      await import("@/db/schema");

    const u = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!u) return { agent: null, error: null };

    const team = u.teamId
      ? await db.query.teams.findFirst({ where: eq(teams.id, u.teamId) })
      : null;

    const saleRows = await db
      .select({
        id: salesRecords.id,
        leadId: salesRecords.leadId,
        leadName: leads.fullName,
        status: salesRecords.salesStatus,
        revenueValue: salesRecords.revenueValue,
        syncedAt: salesRecords.syncedAt,
      })
      .from(salesRecords)
      .leftJoin(leads, eq(leads.id, salesRecords.leadId))
      .where(eq(salesRecords.agentId, u.id))
      .orderBy(desc(salesRecords.syncedAt))
      .limit(50);

    let dealsClosed = 0;
    let revenueMyr = 0;
    for (const s of saleRows) {
      if (s.status && CLOSED_LIKE.has(s.status)) {
        dealsClosed++;
        revenueMyr += s.revenueValue ? Number(s.revenueValue) : 0;
      }
    }

    const pools = await db
      .select({ id: websites.id, name: websites.name, slug: websites.slug })
      .from(websiteAgents)
      .innerJoin(websites, eq(websites.id, websiteAgents.websiteId))
      .where(eq(websiteAgents.userId, u.id));

    const [totalRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(salesRecords)
      .where(eq(salesRecords.agentId, u.id));

    return {
      agent: {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        teamName: team?.name ?? null,
        isActive: u.isActive,
        dailyCapacity: u.dailyCapacity,
        dealsClosed,
        totalRecords: Number(totalRow?.n ?? 0),
        revenueMyr,
        pools,
        recentSales: saleRows.slice(0, 20).map((s) => ({
          id: s.id,
          leadId: s.leadId,
          leadName: s.leadName,
          status: s.status,
          revenue: s.revenueValue ? Number(s.revenueValue) : null,
          syncedAt: s.syncedAt,
        })),
      },
      error: null,
    };
  } catch (err) {
    return { agent: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { agent, error } = await load(id);
  if (!agent && !error) notFound();

  return (
    <div className="p-8 max-w-5xl">
      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      {agent && (
        <>
          <header className="mb-6">
            <Link href="/agents" className="text-sm text-zinc-500 hover:underline">
              ← Agents
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {agent.fullName ?? agent.email}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {agent.teamName ?? "(no team)"} ·{" "}
              {agent.isActive ? "active" : "inactive"} · cap {agent.dailyCapacity}/day
            </p>
          </header>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <Stat label="Deals closed" value={agent.dealsClosed.toString()} />
            <Stat label="Sales records" value={agent.totalRecords.toString()} />
            <Stat
              label="Avg deal"
              value={
                agent.dealsClosed > 0
                  ? `RM ${Math.round(agent.revenueMyr / agent.dealsClosed).toLocaleString()}`
                  : "—"
              }
            />
            <Stat
              label="Revenue"
              value={`RM ${agent.revenueMyr.toLocaleString()}`}
              big
            />
          </div>

          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Website pools
          </h2>
          <div className="mb-8 flex flex-wrap gap-2">
            {agent.pools.length === 0 ? (
              <span className="text-sm text-zinc-500">
                Not in any website pool yet — add them on{" "}
                <Link href="/admin/websites" className="underline">
                  Websites
                </Link>
                .
              </span>
            ) : (
              agent.pools.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/websites/${p.id}`}
                  className="text-sm rounded-full bg-zinc-100 dark:bg-zinc-900 px-3 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  {p.name}
                </Link>
              ))
            )}
          </div>

          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Recent sales (credited as closer)
          </h2>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {agent.recentSales.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-zinc-500">
                      No sales recorded yet.
                    </td>
                  </tr>
                ) : (
                  agent.recentSales.map((s) => (
                    <tr
                      key={s.id}
                      className="border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    >
                      <td className="px-4 py-2.5">
                        {s.leadId ? (
                          <Link href={`/leads/${s.leadId}`} className="hover:underline">
                            {s.leadName ?? "—"}
                          </Link>
                        ) : (
                          (s.leadName ?? "—")
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">{s.status ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs tabular-nums text-right">
                        {s.revenue != null ? `RM ${s.revenue.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-500 tabular-nums">
                        {new Date(s.syncedAt).toLocaleDateString("en-MY")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-white dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 ${big ? "text-2xl" : "text-xl"} font-semibold tabular-nums`}>
        {value}
      </div>
    </div>
  );
}
