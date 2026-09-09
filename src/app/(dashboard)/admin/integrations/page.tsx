import { isNotNull } from "drizzle-orm";
import { Disclosure } from "@/components/mobile/disclosure";
import { IntegrationRows } from "./integration-rows";
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

  /**
   * One string per service, written once and used by both renderings — the
   * phone sheet and the desktop paragraph — so the two can never end up saying
   * different things about the same dot.
   *
   * The env-var names are gone from all three. `TIKTOK_LIVE_PROVIDER +
   * TIKTOK_LIVE_API_KEY` is not something an admin on a phone can act on, and
   * the sentence it sat in described the *unconfigured* state as a problem when
   * it is in fact how this deployment runs: capture is the self-hosted Fly.io
   * connector, and no vendor is the normal, paid-for-nothing steady state. Note
   * these are strings built on the server from presence booleans only; the one
   * value that appears is the provider name, which today's HTML already
   * prints (contract 22).
   */
  const tiktokDetail = tiktokConfigured
    ? `Vendor: ${tiktokProvider}. Pulls finished LIVE sessions (viewers, likes, comments, shares) for tracked handles.`
    : "No vendor configured — lives are still captured by the Fly.io connector.";
  const aiDetail = aiConfigured
    ? "Reads a streamer's uploaded LIVE screenshots into metrics."
    : "Screenshot reading is off — streamers type numbers by hand.";
  const telegramDetail = telegramConfigured
    ? "A user pairs by sending /start <their email> to the bot."
    : "Telegram is off — no reminders or capture alerts are delivered.";

  return (
    <div className="px-4 py-5 sm:p-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
          Integrations
        </h1>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      {/* Phone: the one thing anyone comes here to do, first and full width,
          then the three answers, then the roster. It is a sibling of the
          desktop sections below, not a replacement — at `lg` this whole block
          is gone and the page reads exactly as it does today (P5).

          Two `SyncNowButton`s therefore exist in the DOM, one per breakpoint.
          That is deliberate: the button belongs *inside* the TikTok card on a
          laptop and *above everything* on a phone, and no amount of `order-*`
          moves a child out of its parent. Only one is ever visible, so the
          duplicated state can never diverge in front of anyone. */}
      <div className="lg:hidden">
        <SyncNowButton variant="tiktok" />

        <div className="mt-6">
          <IntegrationRows
            rows={[
              {
                id: "tiktok",
                name: "TikTok Live capture",
                ok: tiktokConfigured,
                neutralWhenOff: true,
                detail: tiktokDetail,
              },
              {
                id: "ai",
                name: "Screenshot reading (AI)",
                ok: aiConfigured,
                detail: aiDetail,
              },
              {
                id: "telegram",
                name: "Telegram bot",
                ok: telegramConfigured,
                detail: telegramDetail,
              },
            ]}
          />
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <Disclosure
            title={`Paired users (${pairedUsers.length})`}
            headingLevel={2}
          >
            {pairedUsers.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No users paired yet.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {pairedUsers.map((u) => (
                  /* Two lines, both breakable. On one line these are two
                     unbreakable strings — an email and a chat id — pulled apart
                     by `justify-between` across about 440px of text in a 311px
                     card, which is how a page starts panning sideways. */
                  <li key={u.email} className="min-h-14 py-3">
                    <div className="break-all text-sm">{u.email}</div>
                    <div className="mt-0.5 break-all text-xs text-zinc-500 dark:text-zinc-400">
                      {u.role} · chat {u.telegramChatId}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Disclosure>
        </div>
      </div>

      {/* Desktop: today's three cards, in today's order. */}
      <div className="hidden lg:block">
        <section className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">TikTok Live capture</h2>
            <StatusDot ok={tiktokConfigured} neutralWhenOff />
          </div>
          <p className="text-sm text-zinc-500 mb-4">{tiktokDetail}</p>
          <SyncNowButton variant="tiktok" />
        </section>

        <section className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">Screenshot reading (AI)</h2>
            <StatusDot ok={aiConfigured} />
          </div>
          {/* Only when it is off. Configured, the sentence said the dot two
              inches away already says — and a string that cannot be false is a
              string nobody reads. */}
          {!aiConfigured && (
            <p className="text-sm text-zinc-500">{aiDetail}</p>
          )}
        </section>

        <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">Telegram bot</h2>
            <StatusDot ok={telegramConfigured} />
          </div>
          <p className="text-sm text-zinc-500 mb-4">{telegramDetail}</p>
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
    </div>
  );
}

/**
 * `neutralWhenOff` is for a service whose "off" is the expected state rather
 * than a fault — the TikTok vendor, which this deployment deliberately does
 * without. Amber on a permanent condition is an alarm that never stops, and one
 * nobody can silence is one nobody reads.
 */
function StatusDot({
  ok,
  neutralWhenOff,
}: {
  ok: boolean;
  neutralWhenOff?: boolean;
}) {
  const offText = neutralWhenOff
    ? "text-zinc-500 dark:text-zinc-400"
    : "text-amber-600 dark:text-amber-400";
  const offDot = neutralWhenOff ? "bg-zinc-400" : "bg-amber-500";

  return (
    <span
      className={`inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider ${
        ok ? "text-emerald-600 dark:text-emerald-400" : offText
      }`}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          ok ? "bg-emerald-500" : offDot
        }`}
      />
      {ok ? "configured" : "not configured"}
    </span>
  );
}
