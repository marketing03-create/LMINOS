import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/authorize";
import { isAdminRole } from "@/lib/auth/access";
import { HelpChip } from "@/components/mobile/metric-help-sheet";
import { ScreenshotList } from "./screenshot-list";
import { requireAdminPage } from "@/lib/auth/page-guard";


export default async function ScreenshotHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ handle?: string; from?: string }>;
}) {
  // Page-level role check: the layout's check can be skipped (see page-guard.ts).
  await requireAdminPage();
  // Admin-only (defense in depth; the layout already blocks non-admins from /admin).
  const me = await getSessionUser();
  if (!me || !isAdminRole(me.role)) redirect("/no-access");

  const { handle, from } = await searchParams;

  // Back to the streamer's detail page when we came from one (`from` = its
  // account id), else to the TikTok Live list.
  const backHref = from ? `/admin/tiktok/${from}` : "/admin/users";
  // Dropping the handle filter keeps `from`, so the back chevron still points
  // where the admin came in from.
  const allHandlesHref = from
    ? `/admin/tiktok/history?from=${encodeURIComponent(from)}`
    : "/admin/tiktok/history";

  /**
   * Read once, render twice. Which values drifted after upload is the answer
   * the page exists for, and both the phone cards and the desktop rows need it,
   * so it is computed here rather than inside either rendering. No query, no
   * shape and no ordering changes — this only re-reads `aiReadValues` against
   * `sessionValues`, exactly as the grid below already did inline.
   */

  return (
    <div className="px-4 py-5 sm:p-8">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center text-sm text-zinc-500 hover:text-zinc-900 lg:min-h-0 dark:hover:text-zinc-100"
          >
            ← {handle ? `@${handle}` : "Users"}
          </Link>
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
          Screenshot history{handle ? <span className="font-mono text-zinc-500"> · @{handle}</span> : null}
        </h1>

        {/* The handle filter, as something a thumb can switch off. It is
            `lg:hidden` because the h1 above already carries `· @handle` at
            every width — this is the 44px control that string never had. */}
        {handle && (
          <Link
            href={allHandlesHref}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-zinc-300 px-4 text-sm text-zinc-600 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 lg:hidden dark:border-zinc-700 dark:text-zinc-400 dark:active:bg-zinc-800"
          >
            @{handle}
            <span aria-hidden="true">✕</span>
            <span className="sr-only">Show every streamer</span>
          </Link>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm leading-relaxed text-zinc-500">
            <b className="font-medium text-amber-700 dark:text-amber-400">Amber</b> = a
            number was changed after uploading.
          </p>
          {/* Where the Views &amp; Likes caveat went: those two come from the
              live capture, so a rounded screenshot value there is expected and
              is never flagged. That is background, not an instruction, so on a
              phone it belongs behind the one help chip (§P4). */}
          <HelpChip keys={["views", "likes", "autoCoverage"]} label="About these numbers" />
        </div>
      </header>

      <ScreenshotList handle={handle} limit={200} />
    </div>
  );
}
