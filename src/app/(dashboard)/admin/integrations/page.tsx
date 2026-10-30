import { headers } from "next/headers";
import { eq, isNotNull, sql } from "drizzle-orm";
import { Disclosure } from "@/components/mobile/disclosure";
import { IntegrationRows } from "./integration-rows";
import { SyncNowButton } from "./sync-now-button";
import { TelegramLinkButton } from "./telegram-link-button";
import {
  WatiConnections,
  type HandleLinkView,
  type WatiConnectionView,
} from "./wati-connections";
import { requireAdminPage } from "@/lib/auth/page-guard";

/**
 * External-service status. LMIROS is TikTok-Live-only — the Zoho, Google Sheets
 * and Google Ads integrations left with the leads/sales/ads features (they live
 * in Adrify now), so this page covers the TikTok capture vendor, the Telegram
 * bot that delivers streamer reminders + admin alerts, and the WATI accounts
 * whose WhatsApp chats become lead counts.
 */

type PairedUser = {
  email: string;
  fullName: string | null;
  role: string;
  telegramChatId: string;
};

type WatiRow = Omit<WatiConnectionView, "webhookUrl"> & { webhookKey: string };
type WatiData = { rows: WatiRow[]; handles: HandleLinkView[] };

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
    console.error("[integrations] load failed:", err);
    return {
      pairedUsers: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Separate from `load()` so a failure here can't take the rest of the page with
 * it — in particular the window between this code shipping and migration 0036
 * (the WATI tables) being applied. Null = hide the WATI section.
 */
function ago(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

async function loadWati(): Promise<WatiData | null> {
  try {
    const { db } = await import("@/db/client");
    const { tiktokAccounts, tiktokWaLinks, watiConnections, whatsappContacts } = await import(
      "@/db/schema"
    );
    // "Today" is Malaysia's day (UTC+8), like every other count in the app.
    const todayMy = sql`date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur'`;
    const [rows, handles] = await Promise.all([
      db
        .select({
          id: watiConnections.id,
          name: watiConnections.name,
          webhookKey: watiConnections.webhookKey,
          apiEndpoint: watiConnections.apiEndpoint,
          hasToken: sql<boolean>`${watiConnections.apiTokenEnc} is not null`,
          isActive: watiConnections.isActive,
          lastEventAt: watiConnections.lastEventAt,
          repliesTracked: sql<boolean>`${watiConnections.repliesSeenAt} is not null`,
          contacts: sql<number>`count(${whatsappContacts.id})::int`,
          // New today = first-EVER contact today; a returning customer's
          // earlier history (firstContactAt) keeps them out.
          contactsToday: sql<number>`(count(${whatsappContacts.id}) filter (where coalesce(${whatsappContacts.firstContactAt}, ${whatsappContacts.firstMessageAt}) >= ${todayMy}))::int`,
          numbers: sql<string[]>`coalesce(array_agg(distinct ${whatsappContacts.channelPhone}) filter (where ${whatsappContacts.channelPhone} is not null), '{}')`,
        })
        .from(watiConnections)
        .leftJoin(whatsappContacts, eq(whatsappContacts.connectionId, watiConnections.id))
        .groupBy(watiConnections.id)
        .orderBy(watiConnections.createdAt),
      db
        .select({
          accountId: tiktokAccounts.id,
          handle: tiktokAccounts.handle,
          connectionId: tiktokWaLinks.connectionId,
          channelPhone: tiktokWaLinks.channelPhone,
          code: tiktokWaLinks.code,
          autoFillTotalLeads: tiktokWaLinks.autoFillTotalLeads,
        })
        .from(tiktokAccounts)
        .leftJoin(tiktokWaLinks, eq(tiktokWaLinks.accountId, tiktokAccounts.id))
        .where(eq(tiktokAccounts.isActive, true))
        .orderBy(tiktokAccounts.handle),
    ]);
    const now = Date.now();
    return {
      rows: rows.map((r) => ({
        ...r,
        lastEventAt: r.lastEventAt ? r.lastEventAt.toISOString() : null,
        lastEventAgo: r.lastEventAt ? ago(now - r.lastEventAt.getTime()) : null,
      })),
      handles: handles.map(({ accountId, handle, connectionId, ...link }) => ({
        accountId,
        handle,
        link: connectionId
          ? {
              connectionId,
              channelPhone: link.channelPhone,
              code: link.code,
              autoFillTotalLeads: link.autoFillTotalLeads ?? false,
            }
          : null,
      })),
    };
  } catch (err) {
    console.error("[integrations] WATI load failed:", err);
    return null;
  }
}

export default async function IntegrationsPage() {
  // Page-level role check: the layout's check can be skipped (see page-guard.ts).
  await requireAdminPage();
  const [{ pairedUsers, error }, wati] = await Promise.all([load(), loadWati()]);
  // The webhook URL WATI must call, on whatever host this page is served from.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "lmiros.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const watiViews: WatiConnectionView[] | null =
    wati?.rows.map(({ webhookKey, ...r }) => ({
      ...r,
      webhookUrl: `${proto}://${host}/api/webhooks/wati/${webhookKey}`,
    })) ?? null;
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
    ? "Each admin taps Link my Telegram once to get alerts in Telegram."
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

        {telegramConfigured && (
          <div className="mt-6">
            <TelegramLinkButton />
          </div>
        )}

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
          {telegramConfigured && (
            <div className="mb-5">
              <TelegramLinkButton />
            </div>
          )}
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

      {/* Once, below both renderings: its rows already collapse, and two copies
          would mean two sets of form ids on the page. */}
      {watiViews && wati && (
        <div className="mt-8">
          <WatiConnections connections={watiViews} handles={wati.handles} />
        </div>
      )}
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
