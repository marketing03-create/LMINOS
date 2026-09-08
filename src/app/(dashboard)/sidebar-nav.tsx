"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// LMIROS is TikTok-only: leads, sales, websites and Google Ads moved to Adrify.
const OPERATIONS = [
  { href: "/admin/tiktok/all", label: "Dashboard" },
  { href: "/tiktok-live", label: "TikTok Live" },
];

const ADMIN = [
  { href: "/admin/tiktok", label: "Streamers & handles" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/audit", label: "Audit log" },
];

// A live streamer (Feature U) sees ONLY their own TikTok Live + the upload flow.
const STREAMER = [
  { href: "/tiktok-live", label: "My TikTok Live" },
  { href: "/tiktok-live/import", label: "Upload results" },
];

/**
 * The one and only list of nav destinations. It renders in two places now: the
 * sticky `lg+` sidebar column, and — verbatim, same component, same props —
 * inside the admin "More" bottom sheet on a phone. That reuse is the whole
 * point: the hrefs above are hard-coded, so if the sheet kept its own copy the
 * two would drift and a page would end up reachable on one client and not the
 * other. Concretely: **a new admin page is unreachable on a phone unless it is
 * in the arrays above.**
 *
 * Which is why nothing in here assumes it is in a sidebar. `flex-1` is inert in
 * a non-flex sheet body and `overflow-y-auto` only scrolls when something above
 * constrains the height, so the wrapper below is honest in both hosts without a
 * `variant` prop — and the prop contract stays `{ role }`, which is what lets
 * the sheet render it without knowing any of this.
 */
export function SidebarNav({ role }: { role?: string }) {
  const pathname = usePathname();

  if (role === "live_streamer") {
    // No group heading here on purpose: it said "TikTok Live" above two items
    // that both already say TikTok Live, so it was a label for nothing (P4).
    // Admins keep theirs — Operations vs Admin is a real distinction.
    return (
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <Section items={STREAMER} pathname={pathname} />
      </nav>
    );
  }

  // Only admins see the full Operations + Admin sidebar. Every other role is
  // default-denied (they land on /no-access) — show them no data links.
  const isAdmin = role === "hq_admin" || role === "marketing_manager";
  if (!isAdmin) {
    return (
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 text-sm lg:text-xs text-zinc-400 dark:text-zinc-500">
          No sections available for your account.
        </p>
      </nav>
    );
  }

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <Section label="Operations" items={OPERATIONS} pathname={pathname} />
      <div className="mt-7">
        <Section label="Admin" items={ADMIN} pathname={pathname} />
      </div>
    </nav>
  );
}

function Section({
  label,
  items,
  pathname,
}: {
  label?: string;
  items: { href: string; label: string }[];
  pathname: string;
}) {
  // Only the single MOST-SPECIFIC match lights up, so a parent link
  // (/tiktok-live) doesn't stay highlighted on a child page (/tiktok-live/import).
  const activeHref = items
    .filter((it) => pathname === it.href || pathname.startsWith(it.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div>
      {label && (
        // 12px on the phone, and the original 11px back at lg. The odd
        // `0.6875rem` is deliberate: 11px is below the readable floor for a
        // phone, but bumping the desktop sidebar's group labels would be a
        // visual regression on a screen nobody complained about (P5).
        <div className="px-3 mb-1.5 text-xs lg:text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
          {label}
        </div>
      )}
      <ul className="space-y-0.5">
        {items.map((it) => {
          const active = it.href === activeHref;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 lg:min-h-0 items-center px-3 py-2 rounded-lg text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? "bg-blue-600 text-white shadow-sm active:bg-blue-700"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100 active:bg-zinc-200/60 dark:active:bg-zinc-800/60 active:text-zinc-900 dark:active:text-zinc-100"
                }`}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
