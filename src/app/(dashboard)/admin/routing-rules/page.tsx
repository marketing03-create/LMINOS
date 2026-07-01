import { asc, eq } from "drizzle-orm";

type Row = {
  id: string;
  priority: number;
  name: string;
  isActive: boolean;
  conditions: unknown;
  action: unknown;
  teamName: string | null;
};

async function load(): Promise<{ rows: Row[]; error: string | null }> {
  try {
    const { db } = await import("@/db/client");
    const { routingRules, teams } = await import("@/db/schema");
    const list = (await db
      .select({
        id: routingRules.id,
        priority: routingRules.priority,
        name: routingRules.name,
        isActive: routingRules.isActive,
        conditions: routingRules.conditions,
        action: routingRules.action,
      })
      .from(routingRules)
      .orderBy(asc(routingRules.priority))) as Row[];

    // Resolve team names from the action JSONB.
    const teamIds = new Set<string>();
    for (const r of list) {
      const teamId =
        r.action &&
        typeof r.action === "object" &&
        "team_id" in (r.action as Record<string, unknown>)
          ? ((r.action as Record<string, unknown>).team_id as string)
          : null;
      if (teamId) teamIds.add(teamId);
    }
    const teamRows = teamIds.size
      ? await db.select({ id: teams.id, name: teams.name }).from(teams)
      : [];
    const nameById = new Map(teamRows.map((t) => [t.id, t.name]));

    const rows = list.map((r) => {
      const teamId =
        r.action &&
        typeof r.action === "object" &&
        "team_id" in (r.action as Record<string, unknown>)
          ? ((r.action as Record<string, unknown>).team_id as string)
          : null;
      return { ...r, teamName: teamId ? (nameById.get(teamId) ?? null) : null };
    });

    return { rows, error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
  void eq;
}

export default async function AdminRoutingRulesPage() {
  const { rows, error } = await load();

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Routing rules</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Lowest priority number wins. Configure via{" "}
          <code>npm run seed:routing</code> or SQL until the inline rule builder
          ships in Phase 1.5.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      <ul className="space-y-3">
        {rows.length === 0 && !error && (
          <li className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-10 text-center text-zinc-500">
            No rules. Run <code>npm run seed:routing</code>.
          </li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4"
          >
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <div>
                <span className="inline-flex items-center justify-center min-w-[2rem] h-6 px-2 rounded-md bg-zinc-100 dark:bg-zinc-900 text-xs font-mono tabular-nums mr-2">
                  {r.priority}
                </span>
                <span className="font-semibold">{r.name}</span>
              </div>
              <span
                className={`text-xs uppercase tracking-wider ${
                  r.isActive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-500"
                }`}
              >
                {r.isActive ? "active" : "off"}
              </span>
            </div>
            <div className="text-xs text-zinc-500 mb-2">
              → assign to team{" "}
              <span className="font-mono">{r.teamName ?? "(unknown)"}</span>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                Show conditions JSON
              </summary>
              <pre className="mt-2 bg-zinc-50 dark:bg-zinc-900 rounded p-2 overflow-x-auto">
                {JSON.stringify(r.conditions, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
