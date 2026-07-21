import Link from "next/link";
import { ScreenshotImporter } from "./screenshot-importer";

export default function TikTokScreenshotsPage() {
  const aiConfigured = !!process.env.AI_GATEWAY_API_KEY;

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <Link href="/admin/tiktok" className="text-sm text-zinc-500 hover:underline">
        ← TikTok Live admin
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Import LIVE screenshots</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload your TikTok LIVE analytics screenshots (any tab — Viewership,
          Engagement, Diamonds, or the Congratulations summary). Claude reads the
          numbers, matches each to the right live <b>by date</b>, and you confirm
          before anything saves.
        </p>
      </header>

      {!aiConfigured && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          AI import is <b>OFF</b>. Create an AI Gateway key in your Vercel dashboard
          and set <code>AI_GATEWAY_API_KEY</code>. Meanwhile, type the numbers into
          the box on each live&apos;s page.
        </div>
      )}

      <ScreenshotImporter />
    </div>
  );
}
