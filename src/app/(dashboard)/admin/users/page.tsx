import { asc, eq } from "drizzle-orm";
import { UsersEditor, type UserRow } from "./users-editor";

async function load(): Promise<{
  rows: UserRow[];
  teams: { id: string; name: string }[];
  error: string | null;
}> {
  try {
    const { db } = await import("@/db/client");
    const { users, teams } = await import("@/db/schema");
    const list = (await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        teamId: users.teamId,
        isActive: users.isActive,
        dailyCapacity: users.dailyCapacity,
        telegramChatId: users.telegramChatId,
      })
      .from(users)
      .orderBy(asc(users.email))) as unknown as Array<
      Omit<UserRow, "telegramPaired"> & { telegramChatId: string | null }
    >;

    const teamList = await db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .orderBy(asc(teams.name));

    return {
      rows: list.map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.fullName,
        role: r.role,
        teamId: r.teamId,
        isActive: r.isActive,
        dailyCapacity: r.dailyCapacity,
        telegramPaired: !!r.telegramChatId,
      })),
      teams: teamList,
      error: null,
    };
  } catch (err) {
    return { rows: [], teams: [], error: err instanceof Error ? err.message : String(err) };
  }
  void eq;
}

export default async function AdminUsersPage() {
  const { rows, teams, error } = await load();

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Auto-created on first Google sign-in. Edit role &amp; team inline below
          — changes save immediately.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      <UsersEditor rows={rows} teams={teams} />
    </div>
  );
}
