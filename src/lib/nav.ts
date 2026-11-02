/**
 * Every page each role may open, grouped for the phone's top-right menu.
 *
 * Pure (no db, no auth runtime) so client components can import it. Kept in
 * step with the access policy by nav.test.ts: every href here must pass
 * `canAccessPath` for its role, and every page in the app must be listed for
 * at least one role — so the menu can neither show a page a role can't open,
 * nor quietly miss a new one.
 */
import type { Role } from "./auth/authorize";

export type NavItem = { href: string; label: string };
export type NavGroup = { label?: string; items: NavItem[] };

const ADMIN_NAV: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/admin/tiktok/all", label: "Dashboard" },
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/tiktok-live", label: "TikTok Live" },
      { href: "/tiktok-live/import", label: "Add live results" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/whatsapp", label: "WhatsApp log" },
      { href: "/admin/integrations", label: "Integrations" },
      { href: "/admin/audit", label: "Audit log" },
      { href: "/admin/tiktok/screenshots", label: "Screenshots" },
      { href: "/admin/tiktok/history", label: "Sync history" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/tiktok-live/notifications", label: "Reminders" },
      { href: "/tiktok-live/profile", label: "Profile" },
    ],
  },
];

const STREAMER_NAV: NavGroup[] = [
  {
    items: [
      { href: "/tiktok-live", label: "Home" },
      { href: "/tiktok-live/import", label: "Add live results" },
      { href: "/tiktok-live/notifications", label: "Reminders" },
      { href: "/tiktok-live/profile", label: "Profile" },
    ],
  },
];

const NO_ACCESS_NAV: NavGroup[] = [{ items: [{ href: "/no-access", label: "No access" }] }];

export function navFor(role: Role | string): NavGroup[] {
  if (role === "hq_admin" || role === "marketing_manager") return ADMIN_NAV;
  if (role === "live_streamer") return STREAMER_NAV;
  return NO_ACCESS_NAV;
}

/** The single most specific item matching the current path (for highlighting). */
export function activeHref(groups: NavGroup[], pathname: string): string | undefined {
  return groups
    .flatMap((g) => g.items)
    .filter((it) => pathname === it.href || pathname.startsWith(it.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
