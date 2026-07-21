import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { TikTokAdmin, type StreamerOption, type TikTokRow } from "./tiktok-admin";
import {
  recentScreenshotMismatches,
  type MismatchAlert,
} from "@/lib/tiktok-live/queries";
import { MismatchAlerts } from "./mismatch-alerts";
import { StreamerChooser, type ChooserOption } from "./streamer-chooser";

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
    <div className="p-4 sm:p-8 max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">TikTok Live</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Pick a streamer to view their live results, or manage handles below.
          </p>
        </div>
        <Link
          href="/admin/tiktok/history"
          className="shrink-0 inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Screenshot history
        </Link>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      {/* Tracker health — the plain-English "is it running?" status. */}
      <div className={`mb-6 rounded-lg border px-4 py-3 ${TONE_CLS[health.tone]}`}>
        <div className="text-sm font-semibold">{health.title}</div>
        <div className="mt-0.5 text-xs opacity-90">{health.detail}</div>
      </div>

      {/* Admin-only: streamer numbers that differ from their screenshot. */}
      <MismatchAlerts alerts={mismatches} />

      {/* The chooser — pick whose live results to view (login-page style). */}
      <StreamerChooser options={options} />

      {/* Handle management (register, keywords, assign streamer, status). */}
      <section className="mt-10">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Manage streamers &amp; handles</h2>
          <p className="text-xs text-zinc-500">
            Register handles, set lead keywords, assign streamers, and toggle status.
          </p>
        </div>
        <TikTokAdmin rows={rows} streamers={streamers} />
      </section>
    </div>
  );
}
