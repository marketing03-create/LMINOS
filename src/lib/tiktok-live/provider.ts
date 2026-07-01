/**
 * Vendor-agnostic TikTok LIVE data provider.
 *
 * There's no official TikTok API for live-room metrics, so a managed vendor
 * (Apify / EnsembleData / tik.tools) monitors a handle server-side and exposes
 * finished sessions. This interface normalizes any vendor to a single shape so
 * swapping vendors = one new file. `getProvider()` picks the implementation
 * from `TIKTOK_LIVE_PROVIDER`; unconfigured → a no-op (so a dark deploy is safe).
 */
import { ApifyProvider } from "./providers/apify";

export type LiveSessionSummary = {
  externalSessionId: string; // vendor/room id — idempotency key per account
  title?: string | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  durationSeconds?: number;
  peakViewers?: number;
  avgViewers?: number;
  totalViews?: number;
  totalLikes?: number;
  totalComments?: number;
  totalShares?: number;
  newFollowers?: number | null;
  raw?: unknown;
};

export interface TikTokLiveProvider {
  readonly name: string;
  /** Finished LIVE sessions for `handle` (no leading @) since `sinceISO`. */
  listRecentSessions(handle: string, sinceISO: string): Promise<LiveSessionSummary[]>;
}

/** Unconfigured: returns nothing so the sync no-ops cleanly (safe dark deploy). */
class NoopProvider implements TikTokLiveProvider {
  readonly name = "none";
  async listRecentSessions(): Promise<LiveSessionSummary[]> {
    return [];
  }
}

/** Deterministic sample data for end-to-end testing without a real vendor. */
class MockProvider implements TikTokLiveProvider {
  readonly name = "mock";
  async listRecentSessions(handle: string): Promise<LiveSessionSummary[]> {
    // Fixed base (no Date.now) → stable ids, so re-runs are idempotent.
    const base = Date.UTC(2026, 5, 1);
    return [0, 1].map((i) => {
      const start = new Date(base + i * 86_400_000 + 13 * 3_600_000);
      const dur = 3600 + i * 1800;
      return {
        externalSessionId: `mock-${handle}-${i}`,
        title: `Sample live ${i + 1}`,
        startedAt: start,
        endedAt: new Date(start.getTime() + dur * 1000),
        durationSeconds: dur,
        peakViewers: 800 + i * 220,
        avgViewers: 400 + i * 120,
        totalViews: 5000 + i * 1500,
        totalLikes: 12000 + i * 4000,
        totalComments: 900 + i * 300,
        totalShares: 120 + i * 40,
        newFollowers: 60 + i * 25,
        raw: { mock: true, handle, i },
      };
    });
  }
}

export function getProvider(): TikTokLiveProvider {
  const name = (process.env.TIKTOK_LIVE_PROVIDER ?? "").toLowerCase();
  switch (name) {
    case "apify":
      return new ApifyProvider();
    case "mock":
      return new MockProvider();
    default:
      return new NoopProvider();
  }
}
