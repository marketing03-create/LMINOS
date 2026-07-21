"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * A global "← Back" control shown at the top of every page (except the role's
 * home, where there's nowhere to go back to). Rendered once by DashboardShell so
 * every page gets it with identical spacing — the page's own top padding then
 * provides the gap down to the page title. Uses browser history (router.back),
 * falling back to the role home if there's no history to pop.
 */
export function BackBar({ homeHref }: { homeHref: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // Nothing to go back to on the landing page for this role.
  if (pathname === homeHref) return null;

  function goBack() {
    // If the user landed here directly (no in-app history), fall back to home.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(homeHref);
    }
  }

  return (
    <div className="px-4 pt-4 sm:px-8 sm:pt-6">
      <button
        onClick={goBack}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <span aria-hidden>←</span> Back
      </button>
    </div>
  );
}
