import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { TikTokAdmin, type StreamerOption, type TikTokRow } from "./tiktok-admin";
import {
  recentScreenshotMismatches,
  type MismatchAlert,
} from "@/lib/tiktok-live/queries";
import { MismatchAlerts } from "./mismatch-alerts";
import { StreamerChooser, type ChooserOption } from "./streamer-chooser";
import { Disclosure } from "@/components/mobile/disclosure";
import { TriageItem } from "@/components/mobile/triage-item";

type Heartbeat = { lastBeatAt: Date | null; note: string | null };

async function load(): Promise<{
  rows: TikTokRow[];
  streamers: StreamerOption[];
  heartbeat: Heartbeat;
  error: string | null;
}> {
  try {
    const { db } = await import("@/db/client");
    const { tiktokAccounts, tiktokLiveSessions, users, workerHeartbeats } =
      await import("@/db/schema");

    const baseRows = await db
      .select({
        id: tiktokAccounts.id,
        handle: tiktokAccounts.handle,
        displayName: tiktokAccounts.displayName,
        isActive: tiktokAccounts.isActive,
        leadKeywords: tiktokAccounts.leadKeywords,
        lastSyncedAt: tiktokAccounts.lastSyncedAt,
        assignedStreamerId: tiktokAccounts.assignedStreamerId,
      })
      .from(tiktokAccounts)
      .orderBy(asc(tiktokAccounts.handle));

    // Total lives per handle. A separate GROUP BY (not a correlated subquery):
    // interpolating table columns into an sql`` template renders them UNqualified,
    // so `... where account_id = id` bound `id` to tiktok_live_sessions.id and
    // always counted 0. This keeps the columns properly qualified.
    const counts = await db
      .select({
        accountId: tiktokLiveSessions.accountId,
        sessions: sql<number>`count(*)::int`,
      })
      .from(tiktokLiveSessions)
      .groupBy(tiktokLiveSessions.accountId);
    const countByAccount = new Map(
      counts.map((c) => [c.accountId, Number(c.sessions)])
    );
    const rows = baseRows.map((r) => ({
      ...r,
      sessions: countByAccount.get(r.id) ?? 0,
    }));

    const streamers = (await db
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.role, "live_streamer"))
      .orderBy(asc(users.email))) as StreamerOption[];

    const [hb] = await db
      .select({ lastBeatAt: workerHeartbeats.lastBeatAt, note: workerHeartbeats.note })
      .from(workerHeartbeats)
      .where(eq(workerHeartbeats.name, "tiktok-live-monitor"))
      .limit(1);

    return {
      rows: rows as unknown as TikTokRow[],
      streamers,
      heartbeat: hb ?? { lastBeatAt: null, note: null },
      error: null,
    };
  } catch (err) {
    return {
      rows: [],
      streamers: [],
      heartbeat: { lastBeatAt: null, note: null },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function trackerHealth(hb: Heartbeat): {
  tone: "up" | "warn" | "down" | "unknown";
  title: string;
  detail: string;
} {
  if (!hb.lastBeatAt) {
    return {
      tone: "unknown",
      title: "Tracker status: no check-in yet",
      detail:
        "The tracker hasn't reported in. Give it ~5 minutes after a restart; if it stays like this, it may not be running.",
    };
  }
  const ageMs = Date.now() - new Date(hb.lastBeatAt).getTime();
  const mins = Math.max(0, Math.round(ageMs / 60000));
  const ago = mins <= 1 ? "just now" : `${mins} min ago`;
  const note = hb.note ? ` (${hb.note})` : "";
  if (ageMs < 15 * 60_000) {
    return {
      tone: "up",
      title: "✅ Tracker is running normally",
      detail: `Last checked in ${ago}${note}. It checks every ~5 minutes.`,
    };
  }
  if (ageMs < 60 * 60_000) {
    return {
      tone: "warn",
      title: "⚠️ Tracker is a bit quiet",
      detail: `Last checked in ${ago} — it normally reports every ~5 min. It may be mid-restart; refresh in a minute.`,
    };
  }
  const hrs = Math.round(ageMs / 3600_000);
  return {
    tone: "down",
    title: "🔴 Tracker looks DOWN",
    detail: `Last checked in about ${hrs}h ago. Lives won't be captured until it's back. It should self-restart; if not, tell me to restart it.`,
  };
}

/**
 * The same heartbeat, said in one line instead of a banner.
 *
 * A separate function rather than extra fields on `trackerHealth`, because that
 * one still feeds the desktop banner and its return shape is not ours to move.
 * The compression is the point: "the tracker is fine" is the answer 95% of the
 * time, and a full-width green panel for a non-event is the first 80px of a
 * phone screen spent saying nothing. Healthy collapses to a status line; only
 * `warn` and `down` — the two states an admin can actually act on — get a row
 * with a colour and a next step.
 */
function trackerLine(hb: Heartbeat): {
  tone: "up" | "warn" | "down" | "unknown";
  line: string;
  detail: string;
} {
  const note = hb.note ? ` (${hb.note})` : "";
  if (!hb.lastBeatAt) {
    return {
      tone: "unknown",
      line: "Tracker: no check-in yet",
      detail: `Give it about 5 minutes after a restart.${note}`,
    };
  }
  const ageMs = Date.now() - new Date(hb.lastBeatAt).getTime();
  const mins = Math.max(0, Math.round(ageMs / 60000));
  const ago = mins <= 1 ? "just now" : `${mins} min ago`;
  if (ageMs < 15 * 60_000) {
    return { tone: "up", line: `Tracker OK · ${ago}${note}`, detail: "" };
  }
  if (ageMs < 60 * 60_000) {
    return {
      tone: "warn",
      line: `Tracker quiet · last check-in ${ago}`,
      detail: `Refresh in a minute.${note}`,
    };
  }
  const hrs = Math.round(ageMs / 3600_000);
  return {
    tone: "down",
    line: `Tracker down · last check-in about ${hrs}h ago`,
    detail: `Lives are not being captured.${note}`,
  };
}

const TONE_CLS: Record<string, string> = {
  up: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  down: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
  unknown:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
};

export default async function AdminTikTokPage() {
  const { rows, streamers, heartbeat, error } = await load();
  const health = trackerHealth(heartbeat);
  const phoneHealth = trackerLine(heartbeat);

  let mismatches: MismatchAlert[] = [];
  try {
    mismatches = await recentScreenshotMismatches(7);
  } catch {
    // non-fatal — the alerts section just won't render
  }

  const emailById = new Map(streamers.map((s) => [s.id, s.email]));
  const options: ChooserOption[] = rows.map((r) => ({
    accountId: r.id,
    handle: r.handle,
    streamer: r.assignedStreamerId ? emailById.get(r.assignedStreamerId) ?? null : null,
    sessions: r.sessions,
    isActive: r.isActive,
  }));

  return (
    <div className="px-4 py-5 sm:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
            TikTok Live
          </h1>
        </div>
        {/* Reachable on a phone from the tab bar's More sheet ("Sync history"),
            so a 32px link duplicating it here would only be competing with the
            chooser for the top of the screen. */}
        <Link
          href="/admin/tiktok/history"
          className="hidden shrink-0 items-center rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 lg:inline-flex"
        >
          Screenshot history
        </Link>
      </header>

      {/*
        Order inverted below `lg`, and only below `lg`. The one thing an admin
        opens this page to do is tap a streamer, and today that sits under two
        full-width banners — roughly 220px of "the tracker is fine" and, on the
        quiet days, nothing else. `order-*` is inert in a block box, so the
        `lg:block` here restores today's source order at 1024px exactly: same
        sections, same sequence, same collapsed margins.
      */}
      <div className="flex flex-col lg:block">
        {error && (
          <div className="order-1 mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 lg:order-none dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            {error}
          </div>
        )}

        {/* Tracker health — the plain-English "is it running?" status. */}
        <div className="order-3 lg:order-none">
          {phoneHealth.tone === "up" ? (
            <p className="mb-6 text-xs tabular-nums text-zinc-500 lg:hidden dark:text-zinc-400">
              {phoneHealth.line}
            </p>
          ) : (
            <div className="mb-6 lg:hidden">
              <TriageItem
                tone={phoneHealth.tone === "down" ? "rose" : "amber"}
                title={phoneHealth.line}
                detail={phoneHealth.detail}
              />
            </div>
          )}
          <div
            className={`mb-6 hidden rounded-lg border px-4 py-3 lg:block ${
              TONE_CLS[health.tone]
            }`}
          >
            <div className="text-sm font-semibold">{health.title}</div>
            <div className="mt-0.5 text-xs opacity-90">{health.detail}</div>
          </div>
        </div>

        {/* Admin-only: streamer numbers that differ from their screenshot. */}
        <div className="order-4 lg:order-none">
          <MismatchAlerts alerts={mismatches} />
        </div>

        {/* The chooser — pick whose live results to view (login-page style).
            It stays HERE in source order, after the banner and the alerts,
            because at `lg` the container is a block box and `order-*` is inert:
            moving this element up in the JSX would reorder the desktop page,
            which §5.12's "Desktop preserved" line forbids in as many words
            ("banner → alerts → chooser → 8-column table … use `order-*`
            utilities, not a source-order change"). `order-2` is what lifts it
            above the tracker on a phone. */}
        <div className="order-2 lg:order-none">
          <StreamerChooser options={options} />
        </div>

        {/* Handle management (register, keywords, assign streamer, status). */}
        <section className="order-5 mt-10 lg:order-none">
          {/*
            `Disclosure` owns 16px of horizontal padding so its summary can be a
            full-bleed 48px tap target, which is why this is pulled flush on a
            phone. At `lg` the body is forced open, and the arbitrary variants
            below zero that padding again so the eight-column table lands on
            exactly the pixel it lands on today — the `pt-3` standing in for the
            `mb-3` the old heading block carried.

            `content-visibility` is not belt-and-braces, it is the load-bearing
            half. globals.css opens the section at `lg` with
            `.lm-sec > .lm-body { display: block }`, and that rule ALONE no
            longer works: every current engine implements a closed <details> as
            `details::details-content { content-visibility: hidden }`, which
            skips the whole subtree regardless of what `display` its children
            ask for. Measured in Chrome 148 on this exact CSS —
            `checkVisibility()` false, the text absent from `innerText`, and a
            layout box still reporting a height, which is why it reads as
            working until you look. Unfixed, the desktop table and the
            add-handle form on this page render as nothing at 1024px. The
            override is scoped here rather than fixed once in globals.css
            because that file is not this owner's; it should move there, and
            this variant should then be deleted.
          */}
          <div className="-mx-4 sm:mx-0 lg:[&>details::details-content]:[content-visibility:visible] lg:[&>details>summary]:px-0 lg:[&>details>.lm-body]:px-0 lg:[&>details>.lm-body]:pb-0 lg:[&>details>.lm-body]:pt-3">
            <Disclosure
              title="Manage handles"
              count={`${rows.length} ${rows.length === 1 ? "handle" : "handles"}`}
              headingLevel={2}
            >
              <TikTokAdmin rows={rows} streamers={streamers} />
            </Disclosure>
          </div>
        </section>
      </div>
    </div>
  );
}
