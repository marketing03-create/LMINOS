import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/authorize";
import { isAdminRole } from "@/lib/auth/access";
import { listScreenshotUploads } from "@/lib/tiktok-live/screenshot-history";
import { signScreenshotUrls } from "@/lib/tiktok-live/screenshot-store";
import { ScreenshotThumb } from "./screenshot-thumb";

const FIELDS: { key: string; label: string; locked?: boolean }[] = [
  { key: "totalViews", label: "Views", locked: true },
  { key: "totalLikes", label: "Likes", locked: true },
  { key: "peakViewers", label: "Peak viewers" },
  { key: "avgViewers", label: "Avg viewers" },
  { key: "newFollowers", label: "New followers" },
  { key: "totalComments", label: "Comments" },
  { key: "totalShares", label: "Shares" },
  { key: "uniqueViewers", label: "Unique viewers" },
  { key: "activeViewers", label: "Active viewers" },
  { key: "avgWatchSeconds", label: "Avg watch (s)" },
  { key: "directMessages", label: "Direct messages" },
  { key: "serviceBioViews", label: "Bio views" },
  { key: "interestedViewers", label: "Interested" },
  { key: "diamonds", label: "Diamonds" },
];

function fmt(d: Date | null): string {
  return d ? new Date(d).toLocaleString("en-MY", { hour12: false }) : "—";
}

export default async function ScreenshotHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ handle?: string; from?: string }>;
}) {
  // Admin-only (defense in depth; the layout already blocks non-admins from /admin).
  const me = await getSessionUser();
  if (!me || !isAdminRole(me.role)) redirect("/no-access");

  const { handle, from } = await searchParams;
  const uploads = await listScreenshotUploads(200, handle);
  const urls = await signScreenshotUrls(uploads.map((u) => u.storagePath));

  // Back to the streamer's detail page when we came from one (`from` = its
  // account id), else to the TikTok Live list.
  const backHref = from ? `/admin/tiktok/${from}` : "/admin/tiktok";

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← {handle ? `@${handle}` : "TikTok Live"}
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Screenshot history{handle ? <span className="font-mono text-zinc-500"> · @{handle}</span> : null}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Every TikTok LIVE screenshot uploaded{handle ? " for this streamer" : ""},
          with what the AI read at upload time. Compare the original image to
          what&apos;s saved on the live — <b>amber</b> means a number was changed
          after uploading. (Views &amp; Likes come from the live capture, so a
          rounded screenshot value there is expected and not flagged.)
        </p>
      </header>

      {uploads.length === 0 && (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
          No screenshots uploaded yet.
        </div>
      )}

      <div className="space-y-4">
        {uploads.map((u) => {
          const url = urls.get(u.storagePath);
          const read = u.aiReadValues ?? {};
          const saved = u.sessionValues;
          const shownFields = FIELDS.filter((f) => read[f.key] != null);
          return (
            <div
              key={u.id}
              className="flex flex-col md:flex-row gap-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4"
            >
              {/* Screenshot — opens a centered in-page lightbox, not a new tab. */}
              <div className="shrink-0">
                <ScreenshotThumb url={url} />
              </div>

              {/* Meta + numbers */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium">
                    {u.uploaderEmail ?? "unknown uploader"}
                  </span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-500">{fmt(u.createdAt)}</span>
                  {u.detectedHandle && (
                    <span className="text-xs font-mono text-zinc-500">
                      @{u.detectedHandle}
                    </span>
                  )}
                  {u.detectedTab && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                      {u.detectedTab}
                    </span>
                  )}
                  {u.detectedDate && (
                    <span className="text-xs text-zinc-500">
                      live date {u.detectedDate}
                    </span>
                  )}
                </div>

                <div className="mt-1 text-xs text-zinc-400">
                  {u.appliedSessionId ? (
                    <Link
                      href={`/tiktok-live/${u.appliedSessionId}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      applied to {u.sessionHandle ? `@${u.sessionHandle} · ` : ""}
                      {fmt(u.sessionStartedAt)} →
                    </Link>
                  ) : (
                    <span>not linked to a live</span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
                  {shownFields.map((f) => {
                    const r = read[f.key];
                    const s = saved ? saved[f.key] : undefined;
                    const mismatch =
                      !f.locked && s != null && r != null && s !== r;
                    const lockedDiff =
                      f.locked && s != null && r != null && s !== r;
                    return (
                      <div key={f.key} className="text-sm">
                        <div className="text-[11px] text-zinc-400">{f.label}</div>
                        <div className="tabular-nums">
                          <span>{r}</span>
                          {mismatch && (
                            <span className="text-amber-600 dark:text-amber-400">
                              {" "}
                              → saved {s}
                            </span>
                          )}
                          {lockedDiff && (
                            <span className="text-zinc-400"> (live {s})</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
