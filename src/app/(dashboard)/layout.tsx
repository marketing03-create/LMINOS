import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/authorize";
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
  if (!me) redirect("/login");

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
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            Something went wrong checking what you&apos;re allowed to see, so we
            didn&apos;t load it. Please refresh — and tell an admin if it keeps
            happening.
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
