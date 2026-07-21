import { isNotNull } from "drizzle-orm";
import { SyncNowButton } from "./sync-now-button";

/**
 * External-service status. LMIROS is TikTok-Live-only — the Zoho, Google Sheets
 * and Google Ads integrations left with the leads/sales/ads features (they live
 * in Adrify now), so this page covers the TikTok capture vendor and the Telegram
 * bot that delivers streamer reminders + admin alerts.
 */

type PairedUser = {
  email: string;
  fullName: string | null;
  role: string;
  telegramChatId: string;
};

async function load(): Promise<{ pairedUsers: PairedUser[]; error: string | null }> {
  try {
    const { db } = await import("@/db/client");
    const { users } = await import("@/db/schema");
    const pairedUsers = (await db
      .select({
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        telegramChatId: users.telegramChatId,
      })
      .from(users)
      .where(isNotNull(users.telegramChatId))
      .limit(100)) as unknown as PairedUser[];

    return { pairedUsers, error: null };
  } catch (err) {
    return {
      pairedUsers: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function IntegrationsPage() {
  const { pairedUsers, error } = await load();
  const telegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN;
  const tiktokProvider = process.env.TIKTOK_LIVE_PROVIDER ?? null;
  const tiktokConfigured = !!tiktokProvider && !!process.env.TIKTOK_LIVE_API_KEY;
  const aiConfigured = !!process.env.AI_GATEWAY_API_KEY;

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm text-zinc-500">
          External-service status for TikTok Live.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      <section className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">TikTok Live capture</h2>
          <StatusDot ok={tiktokConfigured} />
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          {tiktokConfigured
            ? `Vendor "${tiktokProvider}" connected. Pulls finished LIVE sessions (viewers, likes, comments, shares) for tracked handles.`
            : "No live-data vendor configured — set TIKTOK_LIVE_PROVIDER + TIKTOK_LIVE_API_KEY. The self-hosted connector on Fly.io captures lives even without a vendor. Manage handles on the TikTok Live admin page."}
        </p>
        <SyncNowButton variant="tiktok" />
      </section>

      <section className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">Screenshot reading (AI)</h2>
          <StatusDot ok={aiConfigured} />
        </div>
        <p className="text-sm text-zinc-500">
          {aiConfigured
            ? "Vercel AI Gateway connected. Reads a streamer's uploaded LIVE screenshots into metrics."
            : "AI_GATEWAY_API_KEY not configured — streamers can still enter their numbers by hand."}
        </p>
      </section>

      <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">Telegram bot</h2>
          <StatusDot ok={telegramConfigured} />
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          {telegramConfigured
            ? "Bot token configured. A user pairs by sending /start <their email> to the bot — that's what delivers a streamer's morning “lives still need numbers” reminder and the admin capture alerts."
            : "TELEGRAM_BOT_TOKEN not configured."}
        </p>
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
          Paired users ({pairedUsers.length})
        </div>
        <ul className="text-sm space-y-1">
          {pairedUsers.length === 0 && (
            <li className="text-zinc-500">No users paired yet.</li>
          )}
          {pairedUsers.map((u) => (
            <li key={u.email} className="flex justify-between font-mono text-xs">
              <span>{u.email}</span>
              <span className="text-zinc-500">
                {u.role} · chat {u.telegramChatId}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider ${
        ok
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-amber-600 dark:text-amber-400"
      }`}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          ok ? "bg-emerald-500" : "bg-amber-500"
        }`}
      />
      {ok ? "configured" : "not configured"}
    </span>
  );
}
