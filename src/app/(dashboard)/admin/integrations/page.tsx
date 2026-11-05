import { headers } from "next/headers";
import { eq, isNotNull, sql } from "drizzle-orm";
import { SyncNowButton } from "./sync-now-button";
import { TelegramLinkButton } from "./telegram-link-button";
import {
  WatiConnections,
  type HandleLinkView,
  type WatiConnectionView,
} from "./wati-connections";
import { requireAdminPage } from "@/lib/auth/page-guard";
import { DriveSetup, type DriveHandleView } from "./drive-setup";
import { Panel, Section, StatusPill, type Tone } from "./ui";

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
type WatiData = { rows: WatiRow[]; handles: HandleLinkView[]; yesterday: string };

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
    const { tiktokAccounts, tiktokWaLinks, watiConnections, watiDailyChecks, whatsappContacts } =
      await import("@/db/schema");
    const { mytYesterday } = await import("@/lib/wati/crosscheck-core");
    const yesterday = mytYesterday();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
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
          // Today's median first-reply time (minutes), from leads that got one.
          replyMedianToday: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${whatsappContacts.firstReplyAt} - ${whatsappContacts.firstMessageAt})) / 60) filter (where ${whatsappContacts.firstMessageAt} >= ${todayMy} and ${whatsappContacts.firstReplyAt} >= ${whatsappContacts.firstMessageAt})`,
          numbers: sql<string[]>`coalesce(array_agg(distinct ${whatsappContacts.channelPhone}) filter (where ${whatsappContacts.channelPhone} is not null), '{}')`,
          // The last message a CUSTOMER sent (any event can bump lastEventAt).
          lastCustomerAt: sql<string | null>`max(${whatsappContacts.lastMessageAt})`,
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
    // The last week of cross-checks, newest first. Separate and optional: the
    // table arrives with migration 0040.
    const checks = await db
      .select()
      .from(watiDailyChecks)
      .where(sql`${watiDailyChecks.day} >= ${weekAgo}`)
      .orderBy(sql`${watiDailyChecks.day} desc`)
      .catch(() => []);
    const now = Date.now();
    return {
      rows: rows.map((r) => ({
        ...r,
        lastEventAt: r.lastEventAt ? r.lastEventAt.toISOString() : null,
        lastEventAgo: r.lastEventAt ? ago(now - r.lastEventAt.getTime()) : null,
        lastCustomerAgo: r.lastCustomerAt ? ago(now - new Date(r.lastCustomerAt).getTime()) : null,
        lastCustomerHours: r.lastCustomerAt ? (now - new Date(r.lastCustomerAt).getTime()) / 3_600_000 : null,
        checks: checks
          .filter((k) => k.connectionId === r.id)
          .map((k) => ({
            day: k.day,
            watiCustomers: k.watiCustomers,
            found: k.found,
            missing: k.missing,
            notCustomers: k.notCustomers,
            unchecked: k.unchecked,
            error: k.error,
            checkedAgo: ago(now - k.checkedAt.getTime()),
          })),
        replyMedianToday:
          r.replyMedianToday === null || r.replyMedianToday === undefined
            ? null
            : Math.round(Number(r.replyMedianToday) * 10) / 10,
      })),
      yesterday,
      // One entry per handle, with all its links (it can have several).
      handles: [...handles
        .reduce((acc, r) => {
          const h = acc.get(r.accountId) ?? {
            accountId: r.accountId,
            handle: r.handle,
            code: r.code ?? null,
            autoFillTotalLeads: r.autoFillTotalLeads ?? false,
            links: [] as { connectionId: string; channelPhone: string | null }[],
          };
          if (r.connectionId) {
            h.links.push({ connectionId: r.connectionId, channelPhone: r.channelPhone });
            h.code ??= r.code;
            h.autoFillTotalLeads ||= !!r.autoFillTotalLeads;
          }
          return acc.set(r.accountId, h);
        }, new Map<string, HandleLinkView>())
        .values()],
    };
  } catch (err) {
    console.error("[integrations] WATI load failed:", err);
    return null;
  }
}

/**
 * The Google Drive card: the saved service account's email (never the key) and
 * each active handle's Shared Drive. Null = hide it (tables not migrated yet).
 */
async function loadDrive(): Promise<{ email: string | null; handles: DriveHandleView[] } | null> {
  try {
    const { db } = await import("@/db/client");
    const { driveSettings, tiktokAccounts, tiktokDriveLinks } = await import("@/db/schema");
    const setting = await db.select({ email: driveSettings.clientEmail }).from(driveSettings).limit(1);
    const handles = await db
      .select({
        accountId: tiktokAccounts.id,
        handle: tiktokAccounts.handle,
        sharedDriveId: tiktokDriveLinks.sharedDriveId,
        sharedDriveName: tiktokDriveLinks.sharedDriveName,
      })
      .from(tiktokAccounts)
      .leftJoin(tiktokDriveLinks, eq(tiktokDriveLinks.accountId, tiktokAccounts.id))
      .where(eq(tiktokAccounts.isActive, true))
      .orderBy(tiktokAccounts.handle);
    return { email: setting[0]?.email ?? null, handles };
  } catch (err) {
    console.error("[integrations] Drive load failed:", err);
    return null;
  }
}

export default async function IntegrationsPage() {
  // Page-level role check: the layout's check can be skipped (see page-guard.ts).
  await requireAdminPage();
  const [{ pairedUsers, error }, wati] = await Promise.all([load(), loadWati()]);
  const drive = await loadDrive();
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
   * Shown only when a service is off — a status line, not standing copy. Built
   * on the server from presence booleans only; no env value reaches the page
   * except the TikTok provider name (contract 22). No vendor is how this
   * deployment runs (the Fly.io connector captures lives), so it isn't a fault.
   */
  const aiDetail = aiConfigured
    ? "Reads a streamer's uploaded LIVE screenshots into metrics."
    : "Screenshot reading is off — streamers type numbers by hand.";
  const telegramDetail = telegramConfigured
    ? "Each admin taps Link my Telegram once to get alerts in Telegram."
    : "Telegram is off — no reminders or capture alerts are delivered.";

  // The overview strip: one tile per service, each a jump link to its section.
  const watiTotal = watiViews?.length ?? 0;
  const watiConnected = watiViews?.filter((c) => c.isActive && c.lastEventAt).length ?? 0;
  const watiQuiet = watiViews?.some((c) => c.isActive && (c.lastCustomerHours === null || c.lastCustomerHours > 24)) ?? false;
  const tiles: { href: string; name: string; tone: Tone; status: string }[] = [
    ...(watiViews
      ? [
          {
            href: "#whatsapp",
            name: "WhatsApp (WATI)",
            tone: (watiTotal === 0 ? "warn" : watiQuiet ? "warn" : "ok") as Tone,
            status: watiTotal === 0 ? "No account" : `${watiConnected} of ${watiTotal} connected`,
          },
        ]
      : []),
    ...(drive
      ? [
          {
            href: "#drive",
            name: "Google Drive",
            tone: (drive.email ? "ok" : "warn") as Tone,
            status: drive.email ? "Connected" : "Not connected",
          },
        ]
      : []),
    {
      href: "#services",
      name: "TikTok Live capture",
      tone: "ok",
      status: tiktokConfigured ? `Vendor · ${tiktokProvider}` : "Fly.io connector",
    },
    { href: "#services", name: "Screenshot reading", tone: aiConfigured ? "ok" : "warn", status: aiConfigured ? "On" : "Off" },
    {
      href: "#services",
      name: "Telegram",
      tone: telegramConfigured ? "ok" : "warn",
      status: telegramConfigured ? `${pairedUsers.length} paired` : "Off",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:p-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Integrations</h1>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      <nav aria-label="Services" className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => (
          <a
            key={t.name}
            href={t.href}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-zinc-300 active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 lg:dark:bg-zinc-950"
          >
            <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{t.name}</span>
            <span className="mt-1.5 block">
              <StatusPill tone={t.tone}>{t.status}</StatusPill>
            </span>
          </a>
        ))}
      </nav>

      <div className="space-y-12">
        {watiViews && wati && (
          <WatiConnections connections={watiViews} handles={wati.handles} yesterday={wati.yesterday} />
        )}

        {drive && <DriveSetup email={drive.email} handles={drive.handles} />}

        <Section id="services" title="Services">
          <Panel>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              <li className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                <ServiceName
                  name="TikTok Live capture"
                  tone="ok"
                  status={tiktokConfigured ? `Vendor · ${tiktokProvider}` : "Fly.io connector"}
                />
                <SyncNowButton variant="tiktok" />
              </li>
              <li className="flex flex-col gap-1 px-4 py-4">
                <ServiceName name="Screenshot reading (AI)" tone={aiConfigured ? "ok" : "warn"} status={aiConfigured ? "On" : "Off"} />
                {!aiConfigured && <p className="text-sm text-zinc-500">{aiDetail}</p>}
              </li>
              <li className="px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <ServiceName
                    name="Telegram bot"
                    tone={telegramConfigured ? "ok" : "warn"}
                    status={telegramConfigured ? "On" : "Off"}
                  />
                  {telegramConfigured && <TelegramLinkButton />}
                </div>
                {!telegramConfigured && <p className="mt-1 text-sm text-zinc-500">{telegramDetail}</p>}
                <details className="group mt-3">
                  <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 [&::-webkit-details-marker]:hidden">
                    Paired users ({pairedUsers.length})
                    <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  {pairedUsers.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">No users paired yet.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                      {pairedUsers.map((u) => (
                        <li
                          key={u.email}
                          className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                        >
                          <span className="break-all">{u.email}</span>
                          <span className="break-all text-xs text-zinc-500">
                            {u.role} · chat {u.telegramChatId}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </li>
            </ul>
          </Panel>
        </Section>
      </div>
    </div>
  );
}

function ServiceName({ name, tone, status }: { name: string; tone: Tone; status: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{name}</span>
      <StatusPill tone={tone}>{status}</StatusPill>
    </div>
  );
}
