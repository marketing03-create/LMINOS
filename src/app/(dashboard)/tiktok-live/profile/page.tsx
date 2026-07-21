import { getSessionUser } from "@/lib/auth/authorize";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/app/(dashboard)/logout-button";

const ROLE_LABEL: Record<string, string> = {
  live_streamer: "Live Streamer",
  hq_admin: "Admin",
  marketing_manager: "Marketing Manager",
};

/**
 * Streamer Profile tab (bottom-nav "Profile"): who you're signed in as,
 * appearance (Light / Auto / Dark), and Log out. Mobile-first single column.
 */
export default async function StreamerProfilePage() {
  const me = await getSessionUser();
  const email = me?.email ?? "(no session)";
  const initial = (email[0] ?? "?").toUpperCase();
  const roleLabel = me?.role ? ROLE_LABEL[me.role] ?? me.role : "—";

  return (
    <div className="mx-auto max-w-md p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      </header>

      {/* Identity card */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xl font-semibold text-white">
          {initial}
        </span>
        <div className="min-w-0">
          <div className="truncate text-base font-medium text-zinc-900 dark:text-zinc-100">
            {email}
          </div>
          <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            {roleLabel}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Account
        </div>
        <dl className="mt-2 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-500">Email</dt>
            <dd className="truncate text-zinc-900 dark:text-zinc-100">{email}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-500">Role</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{roleLabel}</dd>
          </div>
        </dl>
      </div>

      {/* Appearance */}
      <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Appearance
        </div>
        <ThemeToggle />
      </div>

      <LogoutButton />
    </div>
  );
}
