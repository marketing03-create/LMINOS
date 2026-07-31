import Link from "next/link";
import { ScreenshotImporter } from "@/app/(dashboard)/admin/tiktok/screenshots/screenshot-importer";
import { ManualEntryForm } from "./manual-entry-form";
import { AddPastLive } from "./add-past-live";
import { getSessionUser } from "@/lib/auth/authorize";
import {
  sessionsForMatching,
  streamerAccountIds,
  tiktokAccountsForPicker,
  type MatchCandidate,
} from "@/lib/tiktok-live/queries";

/**
 * Live-streamer upload page (Feature U). Screenshots first (the fast path, needs
 * the AI key), then a type-it-in-by-hand form that always works. Both scope to
 * the streamer's own handles and write through the same routes.
 */
export default async function StreamerImportPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const aiConfigured = !!process.env.AI_GATEWAY_API_KEY;
  // The bottom-nav "+" links here with a mode so each entry point is focused:
  // ?mode=screenshot shows only the photo reader; ?mode=manual shows only the
  // type-it-in + backfill forms. No mode = the full page (any older link).
  const { mode } = await searchParams;
  const showScreenshot = mode !== "manual";
  const showManual = mode !== "screenshot";
  const title =
    mode === "screenshot"
      ? "Screenshot input"
      : mode === "manual"
        ? "Manual input"
        : "Upload your LIVE results";

  // The streamer's own lives (with current values) for the manual form.
  const me = await getSessionUser();
  const scope =
    me?.role === "live_streamer" && me?.userId
      ? await streamerAccountIds(me.userId)
      : undefined;
  let sessions: MatchCandidate[] = [];
  let accounts: { id: string; handle: string }[] = [];
  try {
    sessions = await sessionsForMatching(200, scope);
    accounts = await tiktokAccountsForPicker(scope);
  } catch {
    // DB hiccup — the form shows an empty state; screenshots still work.
  }

  return (
    <div className="p-4 sm:p-8">
      <Link href="/tiktok-live" className="text-sm text-zinc-500 hover:underline">
        ← My TikTok Live
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </header>

      {/* Screenshots — the fast path. */}
      {showScreenshot && (
        <div>
          {showManual && (
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Read from screenshots</h2>
            </div>
          )}

          {!aiConfigured && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              Automatic screenshot reading is <b>OFF</b> right now — use manual
              input instead (it saves the same way).
            </div>
          )}

          <ScreenshotImporter />
        </div>
      )}

      {/* Manual entry — always works, no AI needed. */}
      {showManual && (
        <div className={showScreenshot ? "mt-10" : ""}>
          {showScreenshot && (
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Or type them in yourself</h2>
            </div>
          )}
          <ManualEntryForm sessions={sessions} />
        </div>
      )}

      {/* Backfill — for a live the tracker missed (not in the lists above). */}
      {showManual && (
        <div className="mt-10">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Don&apos;t see your live above?</h2>
          </div>
          <AddPastLive accounts={accounts} />
        </div>
      )}
    </div>
  );
}
