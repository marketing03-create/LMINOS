import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { AddHandle, type StreamerOption, type TikTokRow } from "../tiktok/tiktok-admin";
import {
  recentScreenshotMismatches,
  type MismatchAlert,
} from "@/lib/tiktok-live/queries";
import { MismatchAlerts } from "../tiktok/mismatch-alerts";
import { NudgePanel, type NudgeRow } from "../tiktok/nudge-panel";
import { nudgeStatus } from "@/lib/tiktok-live/admin-nudge";
import { StreamerChooser, type ChooserOption } from "../tiktok/streamer-chooser";
import { TriageItem } from "@/components/mobile/triage-item";
import { requireAdminPage } from "@/lib/auth/page-guard";
import { getSessionUser } from "@/lib/auth/authorize";
import { StatusBar } from "@/components/status-bar";
import { type UserRow } from "./users-editor";
import { AddUser } from "./add-user";
import { PeopleTable } from "./people-table";

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

async function loadPeople(): Promise<{ rows: UserRow[]; error: string | null }> {
  try {
    const { db } = await import("@/db/client");
    const { users } = await import("@/db/schema");
    const list = (await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
        telegramChatId: users.telegramChatId,
      })
      .from(users)
      .orderBy(asc(users.email))) as unknown as Array<
      Omit<UserRow, "telegramPaired"> & { telegramChatId: string | null }
    >;

    return {
      rows: list.map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.fullName,
        role: r.role,
        isActive: r.isActive,
        telegramPaired: !!r.telegramChatId,
      })),
      error: null,
    };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
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

export default async function AdminUsersPage() {
  // Page-level role check: the layout's check can be skipped (see page-guard.ts).
  await requireAdminPage();
  const { rows, streamers, heartbeat, error } = await load();
  const health = trackerHealth(heartbeat);
  const phoneHealth = trackerLine(heartbeat);

  let mismatches: MismatchAlert[] = [];
  try {
    mismatches = await recentScreenshotMismatches(7);
  } catch {
    // non-fatal — the alerts section just won't render
  }

  let nudgeRows: NudgeRow[] | null = null;
  try {
    nudgeRows = (await nudgeStatus()).map((r) => ({
      ...r,
      pendingSince: r.pendingSince?.toISOString() ?? null,
      doneAt: r.doneAt?.toISOString() ?? null,
    }));
  } catch {
    // non-fatal — the panel just won't render
  }

  const emailById = new Map(streamers.map((s) => [s.id, s.email]));
  const options: ChooserOption[] = rows.map((r) => ({
    accountId: r.id,
    handle: r.handle,
    streamer: r.assignedStreamerId ? emailById.get(r.assignedStreamerId) ?? null : null,
    sessions: r.sessions,
    isActive: r.isActive,
  }));

  const people = await loadPeople();
  const me = await getSessionUser();

  // Missing numbers, said in one line for the status bar.
  const owing = (nudgeRows ?? []).filter((r) => r.owed > 0);
  const owedLives = owing.reduce((n, r) => n + r.owed, 0);
  const owedDetail = owing.map((r) => `${r.name || r.email} ${r.owed}`).join(" · ");

  return (
    <div className="px-4 py-5 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
            Users
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Pick whose live results to view — a dropdown, so it no longer
              takes the first screen of the page as a big card. */}
          <StreamerChooser options={options} />
          {/* Reachable on a phone from the tab bar's More sheet ("Sync
              history"), so it stays desktop-only here. */}
          <Link
            href="/admin/tiktok/history"
            className="hidden shrink-0 items-center rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 lg:inline-flex"
          >
            Screenshot history
          </Link>
        </div>
      </header>

      {/* Status first (tracker, missing numbers, screenshot alerts), then the
          people and handles you manage. */}
      <div>
        {error && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            {error}
          </div>
        )}

        {/* Tracker health — the plain-English "is it running?" status. */}
        <div >
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


        {/* Who still owes numbers + the button that tells them. */}
        {nudgeRows && (
          <StatusBar
            tone={owedLives > 0 ? "warn" : "good"}
            title={
              owedLives > 0
                ? `📝 ${owedLives} live${owedLives === 1 ? "" : "s"} missing numbers`
                : "✅ Every live has its numbers"
            }
            detail={owedLives > 0 ? `${owedDetail} · tap to see and notify` : "Last 14 days"}
          >
            <NudgePanel rows={nudgeRows} />
          </StatusBar>
        )}

        {/* Admin-only: streamer numbers that differ from their screenshot. */}
        <MismatchAlerts alerts={mismatches} />

        {/* People and their TikTok handles: one table. A streamer's handle
            sits on their own row; handles nobody is assigned to follow. */}
        <section className="mt-10">
          <h2 className="mb-3 text-[17px] font-semibold lg:text-sm lg:uppercase lg:tracking-wider lg:text-zinc-500">
            People &amp; TikTok handles
            {!people.error && (
              <span className="font-normal text-zinc-400">
                {" "}
                ({people.rows.length} people · {rows.length}{" "}
                {rows.length === 1 ? "handle" : "handles"})
              </span>
            )}
          </h2>
          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            <AddUser />
            <AddHandle />
          </div>
          {people.error && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              Couldn&apos;t load the user list. Refresh to try again.
            </div>
          )}
          <PeopleTable
            users={people.rows}
            handles={rows}
            streamers={streamers}
            currentUserId={me?.userId ?? null}
          />
        </section>
      </div>
    </div>
  );
}
