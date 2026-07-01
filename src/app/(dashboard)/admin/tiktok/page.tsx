import { asc, sql } from "drizzle-orm";
import { TikTokAdmin, type TikTokRow } from "./tiktok-admin";

async function load(): Promise<{ rows: TikTokRow[]; error: string | null }> {
  try {
    const { db } = await import("@/db/client");
    const { tiktokAccounts, tiktokLiveSessions } = await import("@/db/schema");

    const rows = await db
      .select({
        id: tiktokAccounts.id,
        handle: tiktokAccounts.handle,
        displayName: tiktokAccounts.displayName,
        isActive: tiktokAccounts.isActive,
        leadKeywords: tiktokAccounts.leadKeywords,
        lastSyncedAt: tiktokAccounts.lastSyncedAt,
        sessions: sql<number>`(select count(*)::int from ${tiktokLiveSessions} where ${tiktokLiveSessions.accountId} = ${tiktokAccounts.id})`,
      })
      .from(tiktokAccounts)
      .orderBy(asc(tiktokAccounts.handle));

    return { rows: rows as unknown as TikTokRow[], error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function AdminTikTokPage() {
  const { rows, error } = await load();
  const provider = process.env.TIKTOK_LIVE_PROVIDER ?? null;

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">TikTok Live</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Track LIVE session performance (viewers, likes, comments, shares) per
          handle. There&apos;s no official TikTok live API, so a managed vendor
          supplies the data — the sync pulls finished sessions on a schedule.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      <div
        className={`mb-6 rounded-lg border px-3 py-2 text-sm ${
          provider
            ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
            : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
        }`}
      >
        {provider ? (
          <>
            Vendor connected: <b>{provider}</b>. Add handles below; sessions sync
            on the cron (or use Sync now on Integrations).
          </>
        ) : (
          <>
            No vendor configured yet. Set <code>TIKTOK_LIVE_PROVIDER</code> +{" "}
            <code>TIKTOK_LIVE_API_KEY</code> in env to start pulling real data.
            You can still register handles now.
          </>
        )}
      </div>

      <TikTokAdmin rows={rows} />
    </div>
  );
}
