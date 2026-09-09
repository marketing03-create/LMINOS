import Link from "next/link";
import { ScreenshotImporter } from "@/app/(dashboard)/admin/tiktok/screenshots/screenshot-importer";
import { Disclosure } from "@/components/mobile/disclosure";
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
  // The union page still exists because old links point at it. On a phone it
  // stops being a union and becomes a chooser: the three things it offers are
  // three separate jobs, and stacking them meant three product pickers, two
  // file inputs and ~40 numeric boxes in one scroll before you reached the one
  // you came for. At `lg` it is left exactly as it is — see the wrappers below.
  const legacy = !mode;
  const title =
    mode === "screenshot"
      ? "Screenshot input"
      : mode === "manual"
        ? "Type in your results"
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
    <div className="px-4 py-5 sm:p-8">
      {/* `min-h-11` below `lg` only: at `lg` this collapses back to the plain
          14px text link it has always been, in the same place. */}
      <Link
        href="/tiktok-live"
        className="inline-flex min-h-11 items-center text-sm text-zinc-500 active:text-zinc-700 hover:underline lg:min-h-0 dark:active:text-zinc-300"
      >
        ← My TikTok Live
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
      </header>

      {/* Phone chooser for the legacy route. Two links plus — below — the
          backfill form's own trigger, which lands as the third card because the
          two full forms between them are display:none at this width. */}
      {legacy && (
        <div className="mb-3 space-y-3 lg:hidden">
          <ChooserCard href="/tiktok-live/import?mode=screenshot" label="Screenshot input" />
          <ChooserCard href="/tiktok-live/import?mode=manual" label="Type it in" />
        </div>
      )}

      {/* Screenshots — the fast path. */}
      {showScreenshot && (
        <div className={legacy ? "hidden lg:block" : undefined}>
          {showManual && (
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Read from screenshots</h2>
            </div>
          )}

          {!aiConfigured && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              Automatic screenshot reading is <b>OFF</b> right now — use manual
              input instead (it saves the same way).
            </div>
          )}

          <ScreenshotImporter />
        </div>
      )}

      {/* Manual entry — always works, no AI needed. */}
      {showManual && (
        <div
          className={
            legacy ? "mt-10 hidden lg:block" : showScreenshot ? "mt-10" : undefined
          }
        >
          {showScreenshot && (
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Or type them in yourself</h2>
            </div>
          )}
          <ManualEntryForm sessions={sessions} autoSelect={mode === "manual"} />
        </div>
      )}

      {/* Backfill — for a live the tracker missed. Fix F1: it now has a
          permanent home on the route the tab bar's "+" actually links to
          (?mode=manual), not only on the legacy union page nothing links to.
          `id` is the target of the "Add a live that's missing →" button the
          manual form shows when a streamer has no captured lives at all. */}
      {showManual &&
        (mode === "manual" ? (
          <div className="mt-8">
            <Disclosure
              id="add-past-live"
              title="Add a live that's missing"
              headingLevel={2}
              // Open when there is nothing else on the page to do: a streamer
              // whose tracker missed everything should not have to guess that
              // the one control that helps them is behind a closed section.
              defaultOpen={sessions.length === 0}
            >
              <AddPastLive accounts={accounts} alwaysOpen sticky={false} />
            </Disclosure>
          </div>
        ) : (
          // The only other route that still renders this is the legacy union
          // page, where the backfill trigger IS the chooser's third card.
          <div id="add-past-live" className="mt-3 lg:mt-10">
            <div className="mb-3 hidden lg:block">
              <h2 className="text-sm font-semibold">Don&apos;t see your live above?</h2>
            </div>
            <AddPastLive accounts={accounts} />
          </div>
        ))}
    </div>
  );
}

/** A 72px destination row. No subtitle: whatever a second line could say about
 *  "Screenshot input" would read the same against an empty database as a full
 *  one, and the two words are the whole decision. */
function ChooserCard({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-18 w-full items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-[17px] font-semibold text-zinc-900 shadow-sm active:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:active:bg-zinc-800"
    >
      {label}
      <span aria-hidden="true" className="shrink-0 text-zinc-400">
        →
      </span>
    </Link>
  );
}
