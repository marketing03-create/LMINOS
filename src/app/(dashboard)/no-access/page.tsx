import { getSessionUser } from "@/lib/auth/authorize";

/**
 * Neutral landing for a role that has no data access yet (default-deny —
 * Feature U hardening). team_lead / sales_agent / viewer / any unrecognised
 * role lands here instead of being able to browse company data. An admin grants
 * a real role on /admin/users to open things up.
 */
export default async function NoAccessPage() {
  const me = await getSessionUser();
  const email = me?.email ?? "your account";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900 text-2xl">
          🔒
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          No access yet
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Your account (<span className="font-mono">{email}</span>) isn&apos;t set
          up to view anything in LMIROS yet. This is normal for a new sign-in —
          company data stays private until an administrator gives you a role.
        </p>
        <p className="mt-4 text-sm text-zinc-500">
          Please ask your LMIROS administrator to assign your role. If you run
          TikTok lives, they can set you as a <b>Live Streamer</b>.
        </p>
      </div>
    </div>
  );
}
