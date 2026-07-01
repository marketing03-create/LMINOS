import { asc, sql } from "drizzle-orm";
import { TeamsEditor, type TeamRow } from "./teams-editor";

async function load(): Promise<{ rows: TeamRow[]; error: string | null }> {
  try {
    const { db } = await import("@/db/client");
    const { teams, users } = await import("@/db/schema");

    const list = await db
      .select({
        id: teams.id,
        name: teams.name,
        loanTypes: teams.loanTypes,
        isActive: teams.isActive,
        agentCount: sql<number>`(
          select count(*)::int from ${users}
          where ${users.teamId} = ${teams.id} and ${users.isActive} = true
        )`,
      })
      .from(teams)
      .orderBy(asc(teams.name));

    return { rows: list as unknown as TeamRow[], error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function AdminTeamsPage() {
  const { rows, error } = await load();

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Add teams and rename them here; assign agents to teams on the Users
          page. (Loan-type routing is still seeded via <code>npm run seed:routing</code>.)
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      <TeamsEditor rows={rows} />
    </div>
  );
}
