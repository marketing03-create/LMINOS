"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// LMIROS is TikTok-only: leads, sales, websites and Google Ads moved to Adrify.
const OPERATIONS = [
  { href: "/admin/tiktok/all", label: "Overview" },
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

export function SidebarNav({ role }: { role?: string }) {
  const pathname = usePathname();

  if (role === "live_streamer") {
    return (
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <Section label="TikTok Live" items={STREAMER} pathname={pathname} />
      </nav>
    );
  }

  // Only admins see the full Operations + Admin sidebar. Every other role is
  // default-denied (they land on /no-access) — show them no data links.
  const isAdmin = role === "hq_admin" || role === "marketing_manager";
  if (!isAdmin) {
    return (
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 text-xs text-zinc-400 dark:text-zinc-500">
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
  label: string;
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
      <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
        {label}
      </div>
      <ul className="space-y-0.5">
        {items.map((it) => {
          const active = it.href === activeHref;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`flex items-center px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100"
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
