import { desc, eq, isNotNull } from "drizzle-orm";
import { SyncNowButton } from "./sync-now-button";

type Tab = {
  id: string;
  sheetId: string;
  tabName: string;
  lastRowSynced: number;
  lastSyncedAt: Date | null;
  lastError: string | null;
};

type PairedUser = {
  email: string;
  fullName: string | null;
  role: string;
  telegramChatId: string;
};

async function load(): Promise<{
  tabs: Tab[];
  pairedUsers: PairedUser[];
  error: string | null;
}> {
  try {
    const { db } = await import("@/db/client");
    const { sheetSyncState, users } = await import("@/db/schema");
    const tabs = (await db
      .select({
        id: sheetSyncState.id,
        sheetId: sheetSyncState.sheetId,
        tabName: sheetSyncState.tabName,
        lastRowSynced: sheetSyncState.lastRowSynced,
        lastSyncedAt: sheetSyncState.lastSyncedAt,
        lastError: sheetSyncState.lastError,
      })
      .from(sheetSyncState)
      .orderBy(desc(sheetSyncState.lastSyncedAt))) as Tab[];

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

    return { tabs, pairedUsers, error: null };
  } catch (err) {
    return {
      tabs: [],
      pairedUsers: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function IntegrationsPage() {
  const { tabs, pairedUsers, error } = await load();
  const sheetsConfigured = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
  const telegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN;
  const zohoConfigured =
    !!process.env.ZOHO_REFRESH_TOKEN &&
    !!process.env.ZOHO_RESOURCE_ID &&
    !!process.env.ZOHO_WORKSHEET_NAME;
  const tiktokProvider = process.env.TIKTOK_LIVE_PROVIDER ?? null;
  const tiktokConfigured = !!tiktokProvider && !!process.env.TIKTOK_LIVE_API_KEY;
  const googleAdsConfigured =
    !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN && !!process.env.GOOGLE_ADS_CLIENT_ID;

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm text-zinc-500">
          External-service status and recent sync activity.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      <section className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">Zoho Sheet sync</h2>
          <StatusDot ok={zohoConfigured} />
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          {zohoConfigured
            ? "Zoho connected. Pulls form submissions + sales outcomes from your worksheet."
            : "Not configured — set ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN / ZOHO_RESOURCE_ID / ZOHO_WORKSHEET_NAME."}
        </p>
        <SyncNowButton variant="zoho" />
      </section>

      <section className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">Google Ads</h2>
          <StatusDot ok={googleAdsConfigured} />
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          {googleAdsConfigured
            ? "Connected. Pulls daily spend + metrics (impressions, clicks, conversions) per account. Auto-syncs daily; use the button to pull now if it looks stale."
            : "Not configured — set GOOGLE_ADS_DEVELOPER_TOKEN / GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET."}
        </p>
        <SyncNowButton variant="google" />
      </section>

      <section className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">TikTok Live</h2>
          <StatusDot ok={tiktokConfigured} />
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          {tiktokConfigured
            ? `Vendor "${tiktokProvider}" connected. Pulls finished LIVE sessions (viewers, likes, comments, shares) for tracked handles.`
            : "No live-data vendor configured — set TIKTOK_LIVE_PROVIDER + TIKTOK_LIVE_API_KEY (there's no official TikTok live API). Manage handles on the TikTok Live admin page."}
        </p>
        <SyncNowButton variant="tiktok" />
      </section>

      <section className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">Google Sheets sync</h2>
          <StatusDot ok={sheetsConfigured} />
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          {sheetsConfigured
            ? "Service account configured. Cron runs every 2 minutes."
            : "GOOGLE_SERVICE_ACCOUNT_JSON_B64 not configured."}
        </p>
        <SyncNowButton />
        <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
              <tr>
                <Th>Sheet</Th>
                <Th>Tab</Th>
                <Th className="text-right">Last row</Th>
                <Th>Last synced</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {tabs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                    No sheet tabs configured. Insert a row into{" "}
                    <code>sheet_sync_state</code>.
                  </td>
                </tr>
              )}
              {tabs.map((t) => (
                <tr key={t.id} className="border-t border-zinc-100 dark:border-zinc-900">
                  <td className="px-4 py-2 font-mono text-xs">
                    {t.sheetId.slice(0, 16)}…
                  </td>
                  <td className="px-4 py-2">{t.tabName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {t.lastRowSynced}
                  </td>
                  <td className="px-4 py-2 text-zinc-500 tabular-nums">
                    {t.lastSyncedAt
                      ? new Date(t.lastSyncedAt).toLocaleString("en-MY", {
                          hour12: false,
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {t.lastError ? (
                      <span className="text-rose-600 dark:text-rose-400 text-xs">
                        {t.lastError.slice(0, 60)}…
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 text-xs">
                        ok
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">Telegram bot</h2>
          <StatusDot ok={telegramConfigured} />
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          {telegramConfigured
            ? "Bot token configured. Users pair by sending /start <email> to the bot."
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
function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-2 font-medium text-xs uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}
