import Link from "next/link";
import { getSessionUser } from "@/lib/auth/authorize";
import { listUserNotifications } from "@/lib/notifications/user-inbox";
import { MarkReadOnView } from "./mark-read-on-view";

/**
 * The streamer's Notification Center. A route (not a sheet) so `access.ts`
 * allows it automatically for live_streamer via the /tiktok-live/* prefix, and
 * the global BackBar gives a free back button.
 *
 * Rows here are already auto-cleared: a "needs your numbers" reminder vanishes
 * the moment those lives are complete, so an empty list genuinely means done.
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
    <div className="p-4 sm:p-8 max-w-2xl">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
          <div className="text-sm font-medium">You&apos;re all caught up</div>
          <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-500">
            Reminders show up here when a live is still missing its numbers.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((n) => {
            const unread = n.readAt == null;
            return (
              <Link
                key={n.id}
                href={n.href ?? "/tiktok-live"}
                className={`block rounded-2xl border p-4 active:bg-zinc-50 dark:active:bg-zinc-900 ${
                  unread
                    ? "border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                }`}
              >
                <div className="flex items-start gap-2">
                  {unread && (
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600 dark:bg-blue-400"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                        {n.body}
                      </p>
                    )}
                    <div className="mt-1 text-[11px] text-zinc-400">
                      {whenFmt.format(n.updatedAt)}
                    </div>
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
