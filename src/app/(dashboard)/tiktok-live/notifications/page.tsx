import Link from "next/link";
import { getSessionUser } from "@/lib/auth/authorize";
import { listUserNotifications } from "@/lib/notifications/user-inbox";
import { MarkReadOnView } from "./mark-read-on-view";

/**
 * The streamer's reminder list. A route (not a sheet) so `access.ts` allows it
 * automatically for live_streamer via the /tiktok-live/* prefix, and the global
 * BackBar gives a free back button.
 *
 * Rows here are already auto-cleared: a "needs your numbers" reminder vanishes
 * the moment those lives are complete, so an empty list genuinely means done.
 * That is also why the empty state says one thing and stops — a sentence
 * explaining when reminders appear renders identically forever, and the person
 * reading it is by definition looking at the answer already.
 *
 * The row is written out here rather than through `RecordCard`. A reminder's
 * state is read/unread, and the card primitive's rail speaks in amber/emerald
 * ("needs attention" / "complete"), which means something else entirely on a
 * live. Borrowing it would have said the wrong word in the right colour, so we
 * keep the card's geometry — 3px rail, 15px title, chevron-free full-row tap —
 * and give it blue.
 */

const whenFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export default async function NotificationsPage() {
  const me = await getSessionUser();
  const rows = me?.userId ? await listUserNotifications(me.userId, 50) : [];

  return (
    <div className="px-4 py-5 sm:p-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Reminders</h1>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
          <div className="text-sm font-medium">You&apos;re all caught up</div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((n) => {
            const unread = n.readAt == null;
            return (
              <Link
                key={n.id}
                href={n.href ?? "/tiktok-live"}
                className={`flex min-h-16 w-full items-start gap-3 rounded-2xl border border-l-[3px] p-4 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                  unread
                    ? "border-blue-200 border-l-blue-500 bg-blue-50/60 active:bg-blue-100/70 dark:border-blue-900 dark:border-l-blue-400 dark:bg-blue-950/20 dark:active:bg-blue-950/40"
                    : "border-zinc-200 bg-white active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800"
                }`}
              >
                {/* Blue is doing the work of "unread" on its own, and colour
                    alone is WCAG 1.4.1. The dot is for the eye, the hidden word
                    is for the screen reader. */}
                {unread && (
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600 dark:bg-blue-400"
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="break-words text-[15px] font-medium leading-snug">
                    {unread && <span className="sr-only">Unread, </span>}
                    {n.title}
                  </div>
                  {/* The body is the sentence that names which lives owe what.
                      It was 12px, smaller than the title it qualifies — the one
                      thing on this row anybody actually needs to read. */}
                  {n.body && (
                    <p className="mt-1 break-words text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {n.body}
                    </p>
                  )}
                  <div className="mt-1.5 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {whenFmt.format(n.updatedAt)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Clears the badge on open. No router.refresh() — rows stay visually
          unread for this visit instead of flashing mid-read. */}
      <MarkReadOnView />
    </div>
  );
}
