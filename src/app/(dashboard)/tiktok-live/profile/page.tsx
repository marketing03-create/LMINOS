import Link from "next/link";
import { getSessionUser } from "@/lib/auth/authorize";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/app/(dashboard)/logout-button";

const ROLE_LABEL: Record<string, string> = {
  live_streamer: "Live Streamer",
  hq_admin: "Admin",
  marketing_manager: "Marketing Manager",
};

/**
 * Streamer Profile tab (bottom-nav "Profile"). One job: log out. Everything
 * else on the page is here because it has nowhere better to live.
 *
 * The "Account" list that used to sit in the middle repeated the email and the
 * role from the card 40px above it, and that repetition was the only reason Log
 * out fell below the fold on a 375x667 phone — a person signed in on the wrong
 * account had to scroll to find the way out. Identity, Reminders, Appearance
 * and Log out now all land above the fold.
 *
 * Reminders is duplicated here on purpose. The bell in the top bar is the only
 * other way in, and it is a 44px target in the corner that a streamer holding
 * the phone one-handed can miss; the tab bar has no slot for it.
 */
export default async function StreamerProfilePage() {
  const me = await getSessionUser();
  const email = me?.email ?? "(no session)";
  const initial = (email[0] ?? "?").toUpperCase();
  const roleLabel = me?.role ? ROLE_LABEL[me.role] ?? me.role : "—";

  return (
    <div className="px-4 py-5 sm:p-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
      </header>

      {/* Identity. `break-all`, not `truncate`: a work address on a 375px
          screen is exactly the string that gets clipped, and a half-shown
          email is useless to the person who has to read it out to an admin. */}
      <div className="mb-3 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-semibold text-white">
          {initial}
        </span>
        <div className="min-w-0">
          <div className="break-all text-base font-medium text-zinc-900 dark:text-zinc-100">
            {email}
          </div>
          <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            {roleLabel}
          </span>
        </div>
      </div>

      <Link
        href="/tiktok-live/notifications"
        className="mb-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium active:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-950 dark:active:bg-zinc-900"
      >
        Reminders
        <span aria-hidden className="text-zinc-300 dark:text-zinc-600">
          &rsaquo;
        </span>
      </Link>

      <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Appearance
        </div>
        <ThemeToggle />
      </div>

      <LogoutButton />
    </div>
  );
}
