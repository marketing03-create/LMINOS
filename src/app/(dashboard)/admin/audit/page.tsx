import { and, desc, eq, gte, ilike, sql } from "drizzle-orm";
import { AuditFilters, AuditShowMore } from "./audit-mobile";

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
    <div className="px-4 py-5 sm:p-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
          Audit log
        </h1>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      {/* Phone: one chip, the same five controls inside a sheet. It carries the
          current filter state as props (never a row), so this page stays a
          server component and the three frozen queries stay where they are. */}
      <AuditFilters
        q={filter.q ?? ""}
        event={filter.event ?? ""}
        entity={filter.entity ?? ""}
        days={String(filter.days ?? 7)}
        eventTypes={eventTypes}
      />

      {/* Desktop keeps today's form, untouched down to the class list — it is
          simply not rendered below `lg`, where the chip above stands in for it.
          Two forms, one URL contract; neither knows about the other. */}
      <form
        method="get"
        className="hidden lg:grid grid-cols-1 md:grid-cols-5 gap-2 mb-6"
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

      <div className="mb-3 text-xs tabular-nums text-zinc-500">
        {rows.length} of {total.toLocaleString()}
      </div>

      {/* The id is what `AuditShowMore` hangs its media query off — see the
          note there for why the paging is CSS over server-rendered rows rather
          than 200 payloads shipped a second time as props. */}
      <ul id="audit-entries" className="space-y-3 lg:space-y-2">
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
            {/* Three stacked lines below `lg`, today's two-column baseline row
                from `lg` up — same elements, same order, only the flex
                direction and the sizes move.

                What it fixes: the left column is `min-w-0` and truncating, but
                `eventType` inside it is not, so a 34-character event name holds
                the row open and pushes the timestamp column past 375px. The
                page then pans sideways on the one screen whose whole job is
                "who changed what". Stacking them means every value gets the
                full width and wraps instead of choosing a victim. */}
            <div className="mb-2 flex flex-col gap-1 lg:flex-row lg:items-baseline lg:justify-between lg:gap-3">
              <div className="flex min-w-0 flex-col gap-1 lg:flex-row lg:items-baseline lg:gap-2">
                <span className="break-words font-mono text-[15px] font-semibold lg:break-normal lg:text-sm">
                  {r.eventType}
                </span>
                <span className="break-all text-sm text-zinc-500 lg:truncate lg:break-normal lg:text-xs">
                  {r.entityType}:
                  <span className="font-mono ml-1">{r.entityId}</span>
                </span>
              </div>
              <div className="text-xs text-zinc-500 tabular-nums lg:whitespace-nowrap">
                {new Date(r.createdAt).toLocaleString("en-MY", { hour12: false })}
                {r.actorEmail && (
                  <span className="ml-2 break-all text-zinc-400 lg:break-normal">
                    by {r.actorEmail}
                  </span>
                )}
              </div>
            </div>
            {(r.before != null || r.after != null) && (
              <details className="mt-2 text-sm lg:text-xs">
                {/* Left as a `list-item` on purpose rather than flexed to a row:
                    that keeps the browser's own disclosure marker, so desktop
                    still gets the triangle it has today and the phone gets a
                    44px target out of padding alone. */}
                <summary className="min-h-11 cursor-pointer py-3 text-zinc-500 hover:text-zinc-900 active:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 lg:min-h-0 lg:py-0 dark:hover:text-zinc-100 dark:active:text-zinc-100">
                  Show payload
                </summary>
                <div className="mt-2 grid md:grid-cols-2 gap-2">
                  {/* Wrapped below `lg`, `pre` from `lg` up. A JSON payload in
                      its own sideways-scrolling box, nested inside the page
                      scroll, is a trap on a phone: you cannot tell which of the
                      two axes your thumb just moved, and the box is 300px wide.
                      `break-all` because these payloads are mostly uuids and
                      emails, which have nowhere legal to break. */}
                  {r.before != null && (
                    <pre className="bg-rose-50 dark:bg-rose-950/20 rounded p-2 whitespace-pre-wrap break-all lg:whitespace-pre lg:break-normal lg:overflow-x-auto">
                      <span className="text-rose-700 dark:text-rose-400 text-xs uppercase tracking-wider">before</span>
                      {"\n"}
                      {JSON.stringify(r.before, null, 2)}
                    </pre>
                  )}
                  {r.after != null && (
                    <pre className="bg-emerald-50 dark:bg-emerald-950/20 rounded p-2 whitespace-pre-wrap break-all lg:whitespace-pre lg:break-normal lg:overflow-x-auto">
                      <span className="text-emerald-700 dark:text-emerald-400 text-xs uppercase tracking-wider">after</span>
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

      <AuditShowMore total={rows.length} listId="audit-entries" />
    </div>
  );
}
