import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/authorize";
import { canAccessPath, homeForRole } from "@/lib/auth/access";
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
  // = its TikTok; every other role = the neutral /no-access page. Only redirect
  // when the path is actually known (avoids any loop if the header is missing).
  const pathname = (await headers()).get("x-lmiros-pathname");
  if (pathname && !canAccessPath(me.role, pathname)) {
    redirect(homeForRole(me.role));
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
