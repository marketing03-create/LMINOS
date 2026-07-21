import Link from "next/link";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import {
  AuthorizeGmails,
  type AttentionAccount,
  type GmailGroup,
} from "./authorize-gmails";

async function load(): Promise<{
  groups: GmailGroup[];
  attention: AttentionAccount[];
  error: string | null;
}> {
  try {
    const { db } = await import("@/db/client");
    const { adAccounts } = await import("@/db/schema");

    const rows = await db
      .select({
        email: adAccounts.owningEmail,
        total: sql<number>`count(*)::int`,
        authorized: sql<number>`sum(case when ${adAccounts.accessTokenEncrypted} is not null then 1 else 0 end)::int`,
      })
      .from(adAccounts)
      .where(and(eq(adAccounts.platform, "google"), sql`${adAccounts.owningEmail} is not null`))
      .groupBy(adAccounts.owningEmail)
      .orderBy(asc(adAccounts.owningEmail));

    // Accounts that need attention: no owning Gmail set, OR not pulling data
    // (never synced — usually filed under the wrong Gmail → Google 403). Both
    // are fixed by pointing them at the Gmail that can actually open them.
    const attentionRows = await db
      .select({
        id: adAccounts.id,
        displayName: adAccounts.displayName,
        externalAccountId: adAccounts.externalAccountId,
        owningEmail: adAccounts.owningEmail,
        hasToken: sql<boolean>`${adAccounts.accessTokenEncrypted} is not null`,
        lastSyncedAt: adAccounts.lastSyncedAt,
      })
      .from(adAccounts)
      .where(
        and(
          eq(adAccounts.platform, "google"),
          or(isNull(adAccounts.owningEmail), isNull(adAccounts.lastSyncedAt))
        )
      )
      .orderBy(asc(adAccounts.displayName));

    return {
      groups: rows.map((r) => ({
        email: String(r.email),
        total: Number(r.total),
        authorized: Number(r.authorized),
      })),
      attention: attentionRows.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        externalAccountId: r.externalAccountId,
        owningEmail: r.owningEmail,
        hasToken: !!r.hasToken,
        lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
      })),
      error: null,
    };
  } catch (err) {
    return { groups: [], attention: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function AuthorizeGmailsPage() {
  const { groups, attention, error } = await load();

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <Link
        href="/admin/ad-accounts"
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        ← All ad accounts
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Authorize Google sign-ins
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sign in <b>once per Gmail</b> — each sign-in authorizes <b>all</b> the
          accounts that Gmail owns. So 4 Gmails = 4 sign-ins for ~90 accounts.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      <AuthorizeGmails groups={groups} attention={attention} />

      <p className="mt-6 text-xs text-zinc-500">
        After authorizing, go to <Link href="/admin/ad-accounts" className="underline">Ad accounts</Link>{" "}
        and click <b>Sync Google Ads now</b> to pull metrics for the newly-authorized accounts.
      </p>
    </div>
  );
}
