import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/leads", label: "Leads" },
  { href: "/sales", label: "Sales" },
  { href: "/sales/unmatched", label: "Unmatched sales" },
  { href: "/rejected", label: "Rejected pool" },
  { href: "/roas", label: "Real ROAS" },
  { href: "/tiktok-live", label: "TikTok Live" },
  { href: "/agents", label: "Agents" },
  { href: "/how-it-works", label: "How It Works" },
];

const ADMIN_NAV = [
  { href: "/admin/websites", label: "Websites" },
  { href: "/admin/tiktok", label: "TikTok Live" },
  { href: "/admin/ad-accounts", label: "Ad accounts" },
  { href: "/admin/ads-proposals", label: "Ads Proposals" },
  { href: "/admin/ads-blueprints", label: "Account Builder" },
  { href: "/admin/spend", label: "Spend uploads" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/routing-rules", label: "Routing rules" },
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const bypass = process.env.LMIROS_DEV_BYPASS_AUTH === "true";
  let user: { email?: string | null } | null = null;
  if (!bypass) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
    if (!user) {
      redirect("/login");
    }
  } else {
    user = { email: "dev@stub.local" };
  }

  return (
    <div className="min-h-screen flex bg-zinc-50 dark:bg-zinc-950">
      <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black flex flex-col">
        <div className="px-5 py-5 border-b border-zinc-200 dark:border-zinc-800">
          <Link href="/dashboard" className="font-semibold text-lg tracking-tight">
            LMIROS
          </Link>
          <p className="text-[11px] uppercase tracking-wider text-zinc-500 mt-1">
            Revenue Foundation
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm">
          <Section label="Operations" items={NAV} />
          <div className="mt-6">
            <Section label="Admin" items={ADMIN_NAV} />
          </div>
        </nav>

        <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 truncate">
          {user?.email ?? "(no session)"}
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

function Section({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string }[];
}) {
  return (
    <div>
      <div className="px-2 mb-2 text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              className="block px-2 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
