import type { LiveSessionSummary, TikTokLiveProvider } from "../provider";

/**
 * Apify adapter (recommended default vendor). Runs the configured TikTok-live
 * actor for a handle via the synchronous run endpoint and reads its dataset
 * items, one per finished live session.
 *
 * ⚠️ The field names in `mapItem()` are mapped DEFENSIVELY across common
 * variants — VERIFY + adjust them against your chosen actor's actual output
 * once the vendor is picked (run the actor once, inspect a dataset item).
 *
 * Env: TIKTOK_LIVE_API_KEY (Apify token), TIKTOK_LIVE_ACTOR_ID (actor id).
 */
export class ApifyProvider implements TikTokLiveProvider {
  readonly name = "apify";

  async listRecentSessions(
    handle: string,
    sinceISO: string
  ): Promise<LiveSessionSummary[]> {
    const token = process.env.TIKTOK_LIVE_API_KEY;
    const actorId = process.env.TIKTOK_LIVE_ACTOR_ID;
    if (!token || !actorId) {
      throw new Error(
        "Apify provider needs TIKTOK_LIVE_API_KEY + TIKTOK_LIVE_ACTOR_ID"
      );
    }
    const url = `https://api.apify.com/v2/acts/${encodeURIComponent(
      actorId
    )}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Common actor inputs — adjust to your actor's input schema if needed.
      body: JSON.stringify({ username: handle.replace(/^@/, ""), since: sinceISO }),
    });
    if (!res.ok) {
      throw new Error(
        `Apify run failed: HTTP ${res.status} ${await res.text().catch(() => "")}`
      );
    }
    const items = (await res.json()) as unknown;
    return (Array.isArray(items) ? items : [])
      .map((it) => mapItem(it as Record<string, unknown>))
      .filter((s): s is LiveSessionSummary => s !== null);
  }
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function dateOf(v: unknown): Date | null {
  if (v == null) return null;
  const d = new Date(v as string | number);
  return isNaN(d.getTime()) ? null : d;
}

/** Defensive field mapping — align with the actor's real output. */
function mapItem(it: Record<string, unknown>): LiveSessionSummary | null {
  const externalSessionId = String(
    it.roomId ?? it.room_id ?? it.id ?? it.sessionId ?? ""
  ).trim();
  if (!externalSessionId) return null;
  const started = dateOf(it.startedAt ?? it.start_time ?? it.createTime);
  const ended = dateOf(it.endedAt ?? it.end_time ?? it.finishedAt);
  const duration =
    num(it.durationSeconds ?? it.duration) ??
    (started && ended
      ? Math.round((ended.getTime() - started.getTime()) / 1000)
      : 0);
  return {
    externalSessionId,
    title: (it.title ?? it.roomTitle ?? null) as string | null,
    startedAt: started,
    endedAt: ended,
    durationSeconds: duration,
    peakViewers: num(it.peakViewers ?? it.maxViewers ?? it.peak_user_count) ?? 0,
    avgViewers: num(it.avgViewers ?? it.averageViewers) ?? 0,
    totalViews: num(it.totalViews ?? it.viewCount ?? it.views) ?? 0,
    totalLikes: num(it.totalLikes ?? it.likeCount ?? it.likes) ?? 0,
    totalComments: num(it.totalComments ?? it.commentCount ?? it.comments) ?? 0,
    totalShares: num(it.totalShares ?? it.shareCount ?? it.shares) ?? 0,
    newFollowers: num(it.newFollowers ?? it.followCount) ?? null,
    raw: it,
  };
}
