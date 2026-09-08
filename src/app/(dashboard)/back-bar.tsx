"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * A global "← Back" control shown at the top of every page (except the role's
 * home, where there's nowhere to go back to). Rendered once by DashboardShell so
 * every page gets it with identical spacing — the page's own top padding then
 * provides the gap down to the page title. Uses browser history (router.back),
 * falling back to the role home if there's no history to pop.
 */

/**
 * The destinations that already have a permanent bottom-bar slot: the streamer's
 * two tabs and the admin's three. On a phone the back bar costs ~50px of the
 * 667px viewport, and on these five routes it buys nothing — you got here by
 * tapping a tab that is still on screen, and the OS back gesture is right there
 * either way. So below `lg` it is hidden here, and only here.
 *
 * Exact matches on purpose. `/tiktok-live/[id]`, `/tiktok-live/import*` and
 * `/admin/tiktok/screenshots` are deep routes with no tab of their own — they
 * are exactly the pages that still need the control, so a `startsWith` would
 * take it away from the screens it exists for.
 *
 * Desktop is untouched: the wrapper becomes `hidden lg:block`, so at `lg+` the
 * bar renders exactly as it does today, in the same place, with the same
 * spacing (P5).
 */
const TAB_DESTINATIONS = new Set([
  "/tiktok-live", // streamer Home · admin "Lives"
  "/tiktok-live/profile", // streamer Profile
  "/admin/tiktok/all", // admin "Today" (also homeForRole, so usually already null)
  "/admin/tiktok", // admin "Streamers"
]);

export function BackBar({ homeHref }: { homeHref: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // Nothing to go back to on the landing page for this role.
  if (pathname === homeHref) return null;

  const hideOnMobile = TAB_DESTINATIONS.has(pathname);

  function goBack() {
    // If the user landed here directly (no in-app history), fall back to home.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(homeHref);
    }
  }

  return (
    <div
      className={`px-4 pt-4 sm:px-8 sm:pt-6 ${hideOnMobile ? "hidden lg:block" : ""}`}
    >
      <button
        onClick={goBack}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 lg:min-h-0 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-800"
      >
        <span aria-hidden>←</span> Back
      </button>
    </div>
  );
}
