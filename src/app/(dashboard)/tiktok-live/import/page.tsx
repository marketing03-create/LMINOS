import Link from "next/link";
import { ScreenshotImporter } from "@/app/(dashboard)/admin/tiktok/screenshots/screenshot-importer";
import { ManualEntryForm } from "./manual-entry-form";
import { AddPastLive } from "./add-past-live";
import {
  sessionsForMatching,
  streamerAccountIds,
  tiktokAccountsForPicker,
  type MatchCandidate,
} from "@/lib/tiktok-live/queries";
import { missingRequired } from "@/lib/tiktok-live/input-fields";
import { requireLivePage } from "@/lib/auth/page-guard";

type Mode = "manual" | "screenshot" | "missing";

const TABS: { mode: Mode; label: string }[] = [
  { mode: "manual", label: "Type in" },
  { mode: "screenshot", label: "Screenshot" },
  { mode: "missing", label: "Missing live" },
];

/**
 * "Add live results" — one page, three jobs, picked with the tabs under the
 * title (`?mode=`): type a live's numbers in, read them from screenshots, or add
 * a live the tracker missed. No mode means "Type in", the everyday job. All
 * three scope to the streamer's own handles and write through the same routes.
 */
export default async function StreamerImportPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; date?: string }>;
}) {
  const aiConfigured = !!process.env.AI_GATEWAY_API_KEY;
  const { mode: raw, date } = await searchParams;
  const mode: Mode = raw === "screenshot" || raw === "missing" ? raw : "manual";
  // Missing live can start on a day picked from Type in's calendar.
  const initialDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";

  const me = await requireLivePage();
  // Fail closed: a streamer with no id gets an empty scope, never `undefined`
  // ("every handle").
  const scope =
    me?.role === "live_streamer"
      ? me.userId
        ? await streamerAccountIds(me.userId)
        : []
      : undefined;
  let sessions: MatchCandidate[] = [];
  let accounts: { id: string; handle: string }[] = [];
  try {
    sessions = await sessionsForMatching(200, scope);
    accounts = await tiktokAccountsForPicker(scope);
  } catch {
    // DB hiccup — the forms show their empty states; screenshots still work.
  }
  const owing = sessions.filter((s) => missingRequired(s.current) > 0).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:p-8">
      <header className="mb-5">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Add live results</h1>
          {owing > 0 && (
            <span className="mb-0.5 shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              {owing} live{owing === 1 ? "" : "s"} need numbers
            </span>
          )}
        </div>

        <nav
          aria-label="How to add results"
          className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900"
        >
          {TABS.map((t) => {
            const on = t.mode === mode;
            return (
              <Link
                key={t.mode}
                href={`/tiktok-live/import?mode=${t.mode}`}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-10 items-center justify-center rounded-lg px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  on
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-600 active:bg-white/60 lg:hover:text-zinc-900 dark:text-zinc-400 dark:active:bg-zinc-800 lg:dark:hover:text-zinc-100"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {mode === "manual" && <ManualEntryForm sessions={sessions} autoSelect />}

      {mode === "screenshot" &&
        (aiConfigured ? (
          <ScreenshotImporter />
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            Screenshot reading is off right now.{" "}
            <Link href="/tiktok-live/import?mode=manual" className="font-medium underline">
              Type the numbers in
            </Link>{" "}
            instead — it saves the same way.
          </div>
        ))}

      {mode === "missing" && <AddPastLive accounts={accounts} initialDate={initialDate} />}
    </div>
  );
}
