import { requireLivePage } from "@/lib/auth/page-guard";
import { streamerAccountIds } from "@/lib/tiktok-live/queries";
import { linkedAccountIds, listCustomers, recentLives } from "@/lib/drive/customers";
import { CustomerList, liveLabel } from "@/components/customers/customer-list";
import { CustomerSheet, RecountOnOpen } from "@/components/customers/customer-sheet";

/**
 * Customers sending documents. New customer makes their Google Drive folder
 * (IC / Payslip / Bank Statement); each card shows which documents are in.
 * A streamer sees only the customers of their own handles.
 */
export default async function CustomersPage() {
  const me = await requireLivePage();
  const isStreamer = me.role === "live_streamer";
  // Fail closed: a streamer with no id gets an empty scope, never `undefined` (= all).
  const scope = isStreamer ? (me.userId ? await streamerAccountIds(me.userId) : []) : undefined;

  let error: string | null = null;
  let data: Awaited<ReturnType<typeof load>> | null = null;
  try {
    data = await load(scope);
  } catch (err) {
    console.error("[customers] load failed:", err);
    error = "Customers can't be loaded right now.";
  }

  const lives = (data?.lives ?? []).map((l) => ({
    id: l.id,
    accountId: l.accountId,
    label: liveLabel(l.startedAt, l.handle),
  }));
  const newLives = lives.filter((l) => data?.linked.has(l.accountId));

  return (
    <div className="px-4 py-5 sm:p-8">
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Customers</h1>
        {newLives.length > 0 && <CustomerSheet mode="new" lives={newLives} />}
      </header>

      {error && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </p>
      )}

      {data && data.linked.size === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Google Drive isn&apos;t set up for {isStreamer ? "your TikTok account" : "any TikTok account"} yet.
        </p>
      )}

      {data && (
        <>
          <RecountOnOpen />
          <CustomerList rows={data.rows} lives={lives} showLive />
        </>
      )}
    </div>
  );
}

async function load(scope: string[] | undefined) {
  const rows = await listCustomers({ accountIds: scope });
  const lives = await recentLives(scope);
  const linked = await linkedAccountIds();
  // Only the caller's own handles count as "set up".
  const mine = new Set([...linked].filter((id) => !scope || scope.includes(id)));
  return { rows, lives, linked: mine };
}
