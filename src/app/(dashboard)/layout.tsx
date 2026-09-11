import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAccountStatus, getSessionUser } from "@/lib/auth/authorize";
import { canAccessPath, homeForRole, isAdminRole } from "@/lib/auth/access";
import { LiveNotifier } from "./live-notifier";
import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Local JWT verification + one role lookup (no auth-server round trip) — this
  // layout runs on every page navigation. Mutating APIs keep requireRole checks.
  const me = await getSessionUser();
  if (!me) {
    // A signed-in account that has been switched off is not "signed out", and
    // must not be handled like it. Sending it to a bare sign-in form made
    // sign-in itself look broken: it succeeds, bounces straight back, and says
    // nothing — so the person retries the one step that was never the problem.
    const status = await getAccountStatus();
    redirect(status === "inactive" ? "/login?error=account_disabled" : "/login");
  }

  // DEFAULT-DENY page access (Feature U hardening): a role sees only its allowed
  // sections; anything else is bounced to its home. Admins = all; live_streamer
  // = its TikTok; every other role = the neutral /no-access page.
  const pathname = (await headers()).get("x-lmiros-pathname");
  if (pathname && !canAccessPath(me.role, pathname)) {
    redirect(homeForRole(me.role));
  }

  // The header is set for every matched request by src/proxy.ts, so this should
  // be unreachable. If it ever isn't (a proxy/matcher regression), we must not
  // fall through and render the page — that would hand a live_streamer the admin
  // Overview. Deny instead. Rendered inline rather than redirected, because a
  // redirect would loop: the same missing header would fail again on the target.
  if (!pathname && !isAdminRole(me.role)) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="text-lg font-medium">Can&apos;t verify this page</h1>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-500">
            Couldn&apos;t verify your access. Refresh, or tell an admin.
          </p>
        </div>
      </main>
    );
  }

  const email = me.email ?? "(no session)";
  const homeHref = homeForRole(me.role);
  const isAdmin = me.role === "hq_admin" || me.role === "marketing_manager";

  return (
    <>
      {isAdmin && <LiveNotifier />}
      <DashboardShell role={me.role} email={email} homeHref={homeHref}>
        {children}
      </DashboardShell>
    </>
  );
}
