import { and, desc, eq, gte, ilike, sql } from "drizzle-orm";

type AuditRow = {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
};

type FilterState = {
  q?: string;
  event?: string;
  entity?: string;
  days?: number;
};

async function load(filter: FilterState): Promise<{
  rows: AuditRow[];
  total: number;
  eventTypes: { type: string; n: number }[];
  error: string | null;
}> {
  try {
    const { db } = await import("@/db/client");
    const { auditLogs, users } = await import("@/db/schema");

    const cutoff = filter.days
      ? new Date(Date.now() - filter.days * 24 * 60 * 60 * 1000)
      : null;

    const wheres = [];
    if (filter.event) wheres.push(eq(auditLogs.eventType, filter.event));
    if (filter.entity) wheres.push(eq(auditLogs.entityType, filter.entity));
    if (filter.q) wheres.push(ilike(auditLogs.entityId, `%${filter.q}%`));
    if (cutoff) wheres.push(gte(auditLogs.createdAt, cutoff));
    const whereClause = wheres.length ? and(...wheres) : undefined;

    const rows = (await db
      .select({
        id: auditLogs.id,
        eventType: auditLogs.eventType,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        actorUserId: auditLogs.actorUserId,
        actorEmail: users.email,
        before: auditLogs.before,
        after: auditLogs.after,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(200)) as AuditRow[];

    const total = await db.$count(auditLogs, whereClause);

    const eventTypes = (await db
      .select({
        type: auditLogs.eventType,
        n: sql<number>`count(*)::int`,
      })
      .from(auditLogs)
      .where(cutoff ? gte(auditLogs.createdAt, cutoff) : undefined)
      .groupBy(auditLogs.eventType)
      .orderBy(sql`count(*) desc`)
      .limit(20)) as { type: string; n: number }[];

    return { rows, total, eventTypes, error: null };
  } catch (err) {
    return {
      rows: [],
      total: 0,
      eventTypes: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    event?: string;
    entity?: string;
    days?: string;
  }>;
}) {
  const sp = await searchParams;
  const filter: FilterState = {
    q: sp.q || undefined,
    event: sp.event || undefined,
    entity: sp.entity || undefined,
    days: sp.days ? Number(sp.days) : 7,
  };
  const { rows, total, eventTypes, error } = await load(filter);

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Every state-changing action across LMIROS is recorded here. PDPA
          requirement.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      <form
        method="get"
        className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-6"
      >
        <input
          name="q"
          defaultValue={filter.q}
          placeholder="Entity id contains…"
          className="w-full min-w-0 h-9 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm md:col-span-2"
        />
        <select
          name="event"
          defaultValue={filter.event ?? ""}
          className="w-full min-w-0 h-9 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
        >
          <option value="">All events</option>
          {eventTypes.map((e) => (
            <option key={e.type} value={e.type}>
              {e.type} ({e.n})
            </option>
          ))}
        </select>
        <select
          name="entity"
          defaultValue={filter.entity ?? ""}
          className="w-full min-w-0 h-9 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
        >
          <option value="">All entities</option>
          <option value="lead">lead</option>
          <option value="sales_record">sales_record</option>
          <option value="rejected_lead">rejected_lead</option>
          <option value="user">user</option>
          <option value="ad_spend_batch">ad_spend_batch</option>
        </select>
        <select
          name="days"
          defaultValue={String(filter.days ?? 7)}
          className="w-full min-w-0 h-9 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm"
        >
          <option value="1">Last 24h</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <button
          type="submit"
          className="md:col-span-5 h-9 rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 text-sm font-medium"
        >
          Apply filters
        </button>
      </form>

      <div className="mb-3 text-xs text-zinc-500">
        Showing {rows.length} of {total.toLocaleString()} matching entries
      </div>

      <ul className="space-y-2">
        {rows.length === 0 && !error && (
          <li className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-10 text-center text-zinc-500">
            No audit entries match the filters.
          </li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4"
          >
            <div className="flex items-baseline justify-between mb-2 gap-3">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-mono text-sm font-semibold">
                  {r.eventType}
                </span>
                <span className="text-xs text-zinc-500 truncate">
                  {r.entityType}:
                  <span className="font-mono ml-1">{r.entityId}</span>
                </span>
              </div>
              <div className="text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                {new Date(r.createdAt).toLocaleString("en-MY", { hour12: false })}
                {r.actorEmail && (
                  <span className="ml-2 text-zinc-400">by {r.actorEmail}</span>
                )}
              </div>
            </div>
            {(r.before != null || r.after != null) && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                  Show payload
                </summary>
                <div className="mt-2 grid md:grid-cols-2 gap-2">
                  {r.before != null && (
                    <pre className="bg-rose-50 dark:bg-rose-950/20 rounded p-2 overflow-x-auto">
                      <span className="text-rose-700 dark:text-rose-400 text-[10px] uppercase tracking-wider">before</span>
                      {"\n"}
                      {JSON.stringify(r.before, null, 2)}
                    </pre>
                  )}
                  {r.after != null && (
                    <pre className="bg-emerald-50 dark:bg-emerald-950/20 rounded p-2 overflow-x-auto">
                      <span className="text-emerald-700 dark:text-emerald-400 text-[10px] uppercase tracking-wider">after</span>
                      {"\n"}
                      {JSON.stringify(r.after, null, 2)}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
