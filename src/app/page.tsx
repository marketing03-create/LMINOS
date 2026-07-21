import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/authorize";
import { homeForRole } from "@/lib/auth/access";

/**
 * "/" is the ONLY place that decides where a signed-in user lands, so the
 * login page and the OAuth callback can both just point here and stay
 * role-agnostic. An admin goes to /admin/tiktok, a streamer to /tiktok-live,
 * and every other role to /no-access.
 *
 * This used to hardcode /dashboard, which 404s now that the Overview page left
 * with the leads/sales features.
 */
export default async function Home() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  redirect(homeForRole(me.role));
}
