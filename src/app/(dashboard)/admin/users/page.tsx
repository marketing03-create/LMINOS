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
    <div className="p-4 sm:p-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Add someone here, or they&apos;re auto-created on their first Google
          sign-in. Edit their role inline below — changes save immediately.
          Give a <b>Live Streamer</b> a TikTok handle on the TikTok Live admin
          page.
        </p>
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
