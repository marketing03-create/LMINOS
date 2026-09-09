import Link from "next/link";
import { ScreenshotImporter } from "./screenshot-importer";

export default function TikTokScreenshotsPage() {
  const aiConfigured = !!process.env.AI_GATEWAY_API_KEY;

  return (
    <div className="px-4 py-5 sm:p-8">
      <Link
        href="/admin/tiktok"
        className="inline-flex min-h-11 items-center text-sm text-zinc-500 hover:underline lg:min-h-0"
      >
        ← TikTok Live admin
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Import LIVE screenshots
        </h1>
      </header>

      {/* The old version of this named an env var and a Vercel dashboard — an
          instruction for whoever deploys LMIROS, shown to the manager who just
          wanted to upload a screenshot. What they can act on is the fallback,
          so that is all that is left. */}
      {!aiConfigured && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          AI import is off — enter numbers on the live&apos;s page.
        </div>
      )}

      <ScreenshotImporter />
    </div>
  );
}
