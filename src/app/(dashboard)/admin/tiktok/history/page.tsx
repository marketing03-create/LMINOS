import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/authorize";
import { isAdminRole } from "@/lib/auth/access";
import { listScreenshotUploads } from "@/lib/tiktok-live/screenshot-history";
import { signScreenshotUrls } from "@/lib/tiktok-live/screenshot-store";
import { RecordCard } from "@/components/mobile/record-card";
import { HelpChip } from "@/components/mobile/metric-help-sheet";
import type { MetricItem } from "@/components/mobile/metric-line";
import {
  ScreenshotGallery,
  ScreenshotThumb,
  UploadFilter,
  type GalleryItem,
  type UploadMeta,
} from "./screenshot-gallery";

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

/**
 * The card face wants a date a thumb-width column can hold, so it drops the
 * seconds and the year that `fmt` prints for the desktop table. `fmt` itself is
 * untouched — the 22-column-adjacent desktop rows below still render exactly
 * the string they render today.
 */
function fmtShort(d: Date | null): string {
  return d
    ? new Date(d).toLocaleString("en-MY", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "";
}

/**
 * "3 hr ago" beats a timestamp for the question this page answers — was this
 * uploaded just now, or last month? The absolute time stays beside it, because
 * the relative one cannot be cross-checked against a live.
 */
function rel(d: Date | null): string {
  if (!d) return "";
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

const nf = (n: number) => n.toLocaleString("en-MY");

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
  const rows = uploads.map((u, i) => {
    const read = u.aiReadValues ?? {};
    const saved = u.sessionValues;
    const shown = FIELDS.filter((f) => read[f.key] != null);
    const changed = shown.filter((f) => {
      const s = saved ? saved[f.key] : undefined;
      return !f.locked && s != null && read[f.key] != null && s !== read[f.key];
    });
    // A number the screenshot showed and the live does NOT hold is a gap, not
    // agreement. `changed` deliberately skips those (a null cannot have
    // "drifted"), so without this the card would print "Matches the saved
    // values" over a live that saved none of them — P1's exact failure, on the
    // one page that exists to audit those numbers. Locked fields are excluded
    // for the same reason they are excluded from `changed`: Views and Likes
    // come off the live capture, so the screenshot is not their source.
    const missing = shown.filter(
      (f) => !f.locked && saved != null && saved[f.key] == null
    );
    return {
      u,
      i,
      url: urls.get(u.storagePath),
      read,
      saved,
      shown,
      changed,
      missing,
    };
  });

  const meta: UploadMeta[] = rows.map((r) => ({
    key: r.u.id,
    changed: r.changed.length > 0,
  }));

  return (
    <div className="px-4 py-5 sm:p-8">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center text-sm text-zinc-500 hover:text-zinc-900 lg:min-h-0 dark:hover:text-zinc-100"
          >
            ← {handle ? `@${handle}` : "TikTok Live"}
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

      {uploads.length === 0 && (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
          No screenshots uploaded yet.
        </div>
      )}

      {/* ONE shared gallery for every screenshot on the page: open any image,
          then ‹ › / arrow keys / swipe move through the rest without closing.
          Both renderings live inside it and index into the SAME items array, so
          a thumbnail opens the same picture whichever one you tapped. */}
      <ScreenshotGallery
        items={uploads.map((u): GalleryItem => ({
          url: urls.get(u.storagePath),
          caption: [
            u.uploaderEmail ?? "unknown uploader",
            fmt(u.createdAt),
            u.detectedHandle ? `@${u.detectedHandle}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }))}
      >
      {/* ── Phone: one card per upload, changed values on the face ──────────
          The 14-value grid is the thing that fails here. At 375px it is two
          columns of 11px labels, and the amber "→ saved" that the whole page
          exists to surface is one span among fourteen, below a square thumbnail
          that cropped the screenshot into an unreadable centre band. So the
          card leads with the verdict in words, then lists ONLY the values that
          drifted, and keeps the other twelve one tap away in table order. */}
      <div className="lg:hidden">
        <UploadFilter meta={meta}>
          {rows.map(({ u, i, url, read, saved, shown, changed, missing }) => {
            const linked = !!u.appliedSessionId;
            const n = changed.length;
            const m = missing.length;
            const verdict = n
              ? `${n} value${n === 1 ? "" : "s"} changed after upload`
              : !linked
                ? "Not linked to a live"
                : m
                  ? `${m} read value${m === 1 ? "" : "s"} not saved on the live`
                  : "Matches the saved values";

            const primary: MetricItem[] = changed.map((f) => {
              const s = saved ? saved[f.key] : undefined;
              return {
                label: f.label,
                // `changed` was built from `s != null`, so this reads what the
                // screenshot said and what the live holds now, in that order.
                value: s == null ? read[f.key] : `${nf(read[f.key])} → ${nf(s)}`,
                tone: "warn",
              };
            });

            const detail: MetricItem[] = shown.map((f) => {
              const s = saved ? saved[f.key] : undefined;
              const lockedDiff = f.locked && s != null && s !== read[f.key];
              return {
                label: f.label,
                value: read[f.key],
                // Views and Likes come off the live capture, so a screenshot
                // that rounds them is expected — say what the live holds
                // instead of flagging it.
                denominator:
                  lockedDiff && s != null ? `live capture: ${nf(s)}` : undefined,
              };
            });

            return (
              <RecordCard
                key={u.id}
                /* `good` is a claim, so it is only made when every read value
                   is actually on the live. A gap is `neutral` + a plain count:
                   it is not the streamer's fault and not an accusation. */
                tone={n ? "warn" : linked && !m ? "good" : "neutral"}
                status={{
                  label: n
                    ? `${n} changed`
                    : !linked
                      ? "Not linked"
                      : m
                        ? `${m} not saved`
                        : "Matches",
                  tone: n ? "amber" : linked && !m ? "emerald" : "zinc",
                }}
                title={u.uploaderEmail ?? "unknown uploader"}
                meta={
                  <>
                    <span
                      className={`block font-medium ${
                        n ? "text-amber-700 dark:text-amber-400" : ""
                      }`}
                    >
                      {verdict}
                    </span>
                    <span className="mt-0.5 block">
                      {rel(u.createdAt)} · {fmtShort(u.createdAt)}
                      {u.detectedHandle ? ` · @${u.detectedHandle}` : ""}
                    </span>
                  </>
                }
                badges={
                  /* The thumbnail rides in `badges` because it is part of
                     recognising the upload, not a metric — and this card has no
                     `href`, so a button here is legal markup. */
                  <div className="flex w-full items-start gap-3">
                    <ScreenshotThumb index={i} url={url} />
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {u.detectedTab && (
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {u.detectedTab}
                        </span>
                      )}
                      {u.detectedDate && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          live date {u.detectedDate}
                        </span>
                      )}
                    </div>
                  </div>
                }
                primary={primary.length ? primary : undefined}
                detail={detail.length ? detail : undefined}
                detailLabel={`All ${shown.length} read values`}
                footer={
                  u.appliedSessionId ? (
                    <Link
                      href={`/tiktok-live/${u.appliedSessionId}`}
                      className="inline-flex min-h-11 items-center text-blue-600 active:underline dark:text-blue-400"
                    >
                      {/* `fmtShort` returns "" for a null start time — where
                          the desktop row prints `fmt`'s "—". An empty string
                          here would leave a link reading "applied to · →", so
                          the missing date is said in words instead. */}
                      applied to {u.sessionHandle ? `@${u.sessionHandle} · ` : ""}
                      {fmtShort(u.sessionStartedAt) || "start time not recorded"}{" "}
                      →
                    </Link>
                  ) : (
                    <span className="inline-flex min-h-11 items-center text-zinc-500 dark:text-zinc-400">
                      not linked to a live
                    </span>
                  )
                }
              />
            );
          })}
        </UploadFilter>
      </div>

      {/* ── Laptop: today's rows, untouched ─────────────────────────────────
          `hidden lg:block` resolves to `block` at lg, which is what this
          container already was, so the desktop DOM below is section-for-section
          what it was before the cards existed (P5). */}
      <div className="hidden space-y-4 lg:block">
        {uploads.map((u, i) => {
          const url = urls.get(u.storagePath);
          const read = u.aiReadValues ?? {};
          const saved = u.sessionValues;
          const shownFields = FIELDS.filter((f) => read[f.key] != null);
          return (
            <div
              key={u.id}
              className="flex flex-col md:flex-row gap-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4"
            >
              {/* Screenshot — opens the shared gallery at this upload. */}
              <div className="shrink-0">
                <ScreenshotThumb index={i} url={url} />
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
      </ScreenshotGallery>
    </div>
  );
}
