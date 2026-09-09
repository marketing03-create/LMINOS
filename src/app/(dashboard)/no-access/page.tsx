import { LogoutButton } from "@/app/(dashboard)/logout-button";
import { getSessionUser } from "@/lib/auth/authorize";

/**
 * Neutral landing for a role that has no data access yet (default-deny —
 * Feature U hardening). team_lead / sales_agent / viewer / any unrecognised
 * role lands here instead of being able to browse company data. An admin grants
 * a real role on /admin/users to open things up.
 *
 * The one real change: this page used to be a dead end. Below `lg` there is no
 * nav and no drawer for these roles, so somebody who signed in with the wrong
 * account had no way out at all except clearing cookies. Log out is the whole
 * point of the screen now.
 *
 * The email is echoed because it is the only thing here the reader can act on —
 * it is what they quote to an admin, and it is how they notice they are signed
 * in as the wrong person. The two paragraphs about why company data is private
 * and what a Live Streamer is were written for an admin and shown to the one
 * audience that cannot do anything with either.
 */
export default async function NoAccessPage() {
  const me = await getSessionUser();
  const email = me?.email ?? "your account";

  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-2xl dark:bg-zinc-900">
          🔒
        </div>
        <h1 className="text-xl font-semibold tracking-tight">No access yet</h1>
        <p className="mt-2 break-all text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {email} has no role yet.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Ask your LMIROS administrator to assign your role.
        </p>
        {/* 32px of air above the only button on the page: the gap is what stops
            a thumb aimed at the last line of text signing the person out. */}
        <div className="mt-8">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
