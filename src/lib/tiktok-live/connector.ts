/**
 * Self-hosted TikTok LIVE capture (free — no managed vendor). Connects to a
 * handle's CURRENT live via the public Webcast stream, accumulates a summary +
 * keyword leads in a LiveTally, and on stream-end persists it. Node-only (holds
 * a WebSocket) — runs from the CLI (laptop) or the Fly worker, never on Vercel.
 *
 * Field extraction is defensive: the library's event payloads vary by version,
 * so we read several possible field names. Validate against a real live and
 * tighten if needed.
 */
import {
  ControlEvent,
  TikTokLiveConnection,
  WebcastEvent,
} from "tiktok-live-connector";
import { persistLiveCapture } from "./store";
import { signConnectionOptions } from "./sign";
import { LiveTally, type LiveSummary } from "./tally";
import { notifyLiveStarted } from "@/lib/notifications/live-alert";

// Minimal event surface — avoids fighting the library's strict event-map types.
interface Emitter {
  on(event: string, listener: (data: unknown) => void): void;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type CaptureResult = {
  live: boolean;
  sessionId?: string;
  summary?: LiveSummary;
  leadCount?: number;
  error?: string;
};

export async function captureLive(
  handle: string,
  opts: {
    accountId: string;
    keywords: string[];
    log?: (m: string) => void;
    /** Stop + persist after this many ms even if the live is still going
     *  (for quick test captures). Omit to run until the stream ends. */
    maxMs?: number;
  }
): Promise<CaptureResult> {
  const log = opts.log ?? (() => {});
  const uniqueId = handle.replace(/^@+/, "");
  const conn = new TikTokLiveConnection(uniqueId, signConnectionOptions());

  try {
    await conn.connect();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`@${uniqueId} not live: ${msg}`);
    return { live: false, error: msg };
  }

  // Read the live's REAL start time + title from room info, so duration matches
  // TikTok's own timer even when we join mid-stream (create_time = live start).
  const roomData = obj(obj(conn.roomInfo).data);
  const createSec = num(roomData.create_time);
  const liveStartedAt = createSec > 0 ? new Date(createSec * 1000) : new Date();
  const liveTitle = str(roomData.title) || null;

  // Stable per-live key for the idempotent upsert. Prefer the live's START
  // INSTANT (create_time) — it is IDENTICAL across a mid-live reconnect, so if
  // the socket drops and the 5-min poll re-captures the rest of the same live,
  // both attempts land on ONE row (merged via GREATEST) instead of duplicating.
  // `conn.roomId` alone was NOT reliable: it can be blank on one connect and
  // populated on the next, producing two keys for the same live (the observed
  // duplicate). Fall back to roomId / connect-time only when create_time is
  // unavailable.
  const externalSessionId =
    createSec > 0
      ? `live-${createSec}`
      : str(conn.roomId) || `room-${liveStartedAt.getTime()}`;

  const tally = new LiveTally(opts.keywords, liveStartedAt);
  const em = conn as unknown as Emitter;
  log(
    `connected @${uniqueId} (room ${str(conn.roomId)}; live started ${liveStartedAt.toISOString()})`
  );

  em.on(WebcastEvent.CHAT, (d) => {
    const m = obj(d);
    const u = obj(m.user);
    const username = str(u.uniqueId ?? m.uniqueId);
    const nick = str(u.nickname ?? m.nickname) || null;
    if (username) tally.onComment(username, nick, str(m.comment), new Date());
  });
  em.on(WebcastEvent.LIKE, (d) => {
    const m = obj(d);
    const total = num(m.totalLikeCount ?? m.total);
    if (total) tally.onLike(total);
  });
  em.on(WebcastEvent.ROOM_USER, (d) => {
    const m = obj(d);
    // `viewerCount` = concurrent (right now) → peak/avg.
    // `totalUser`   = cumulative unique viewers this live → total views.
    const concurrent = num(m.viewerCount ?? m.total);
    if (concurrent) tally.onViewer(concurrent);
    const cumulative = num(m.totalUser);
    if (cumulative) tally.setTotalViews(cumulative);
  });
  em.on(WebcastEvent.SHARE, () => tally.onShare());
  em.on(WebcastEvent.FOLLOW, () => tally.onFollow());

  // Fire the "went live" alert (in-app pop-out + Telegram) once we're connected.
  // Fire-and-forget so it never delays event handling or fails the capture.
  void notifyLiveStarted({
    handle: uniqueId,
    // Same stable per-live key → a mid-live reconnect won't double-fire the alert.
    roomId: externalSessionId,
    title: liveTitle,
  }).catch(() => {});

  // Resolve when the stream ends (or the socket drops).
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    em.on(WebcastEvent.STREAM_END, finish);
    em.on(ControlEvent.DISCONNECTED, finish);
    em.on(ControlEvent.ERROR, (e) =>
      log(`error: ${str(obj(e).message) || String(e)}`)
    );
    if (opts.maxMs && opts.maxMs > 0) {
      setTimeout(() => {
        log(`reached ${Math.round((opts.maxMs ?? 0) / 1000)}s cap — saving partial session`);
        finish();
      }, opts.maxMs);
    }
  });

  try {
    conn.disconnect();
  } catch {
    // already disconnected
  }

  const endedAt = new Date();
  const summary = tally.summary(endedAt);
  const { sessionId, leadCount } = await persistLiveCapture({
    accountId: opts.accountId,
    externalSessionId,
    title: liveTitle,
    summary,
    leads: tally.leadList(),
    raw: { handle: uniqueId },
  });
  log(
    `ended @${uniqueId}: ${summary.durationSeconds}s · peak ${summary.peakViewers} · ${summary.totalComments} comments · ${leadCount} leads`
  );
  return { live: true, sessionId, summary, leadCount };
}
