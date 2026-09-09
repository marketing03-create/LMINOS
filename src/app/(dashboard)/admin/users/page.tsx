import { asc } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/authorize";
import { UsersEditor, type UserRow } from "./users-editor";
import { AddUser } from "./add-user";

async function load(): Promise<{ rows: UserRow[]; error: string | null }> {
  try {
    const { db } = await import("@/db/client");
    const { users } = await import("@/db/schema");
    const list = (await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
        telegramChatId: users.telegramChatId,
      })
      .from(users)
      .orderBy(asc(users.email))) as unknown as Array<
      Omit<UserRow, "telegramPaired"> & { telegramChatId: string | null }
    >;

    return {
      rows: list.map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.fullName,
        role: r.role,
        isActive: r.isActive,
        telegramPaired: !!r.telegramChatId,
      })),
      error: null,
    };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function AdminUsersPage() {
  const { rows, error } = await load();
  const me = await getSessionUser();

  return (
    <div className="px-4 py-5 sm:p-8">
      <header className="mb-6">
        {/* The count is only worth a line on the phone, where the list is the
            whole screen and you cannot see its length at a glance. The intro
            paragraph that used to sit here is gone: it claimed changes save
            immediately, which was never true — Save is an explicit tap. */}
        <h1 className="text-2xl font-semibold tracking-tight">
          Users
          {/* Only when the query actually answered. `load()` swallows a failure
              into `{rows: [], error}`, so an unguarded count would print
              "Users (0)" — a confident statement that this company has no
              users — at the one moment the number is unknown. P1 is about a
              blank never being rendered as a zero; this is the same
              substitution one level up. */}
          {!error && (
            <span className="font-normal text-zinc-400 lg:hidden"> ({rows.length})</span>
          )}
        </h1>
      </header>

      <div className="mb-6">
        <AddUser />
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      <UsersEditor rows={rows} currentUserId={me?.userId ?? null} />
    </div>
  );
}
