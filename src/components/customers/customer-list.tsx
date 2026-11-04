import type { CustomerRow } from "@/lib/drive/customers";
import { DOC_TYPES, folderUrl, isComplete, localPhone } from "@/lib/drive/core";
import { CustomerSheet, type LiveChoice } from "./customer-sheet";

const liveFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "31 Oct, 10:20 pm · @abangduit.my" — how a live is named in the picker and on cards. */
export function liveLabel(startedAt: Date, handle: string): string {
  return `${liveFmt.format(startedAt)} · @${handle}`;
}

/** The handle's recent lives, plus the customer's own live if it is older than those. */
function editLives(lives: (LiveChoice & { accountId: string })[], c: CustomerRow): LiveChoice[] {
  const own = lives.filter((l) => l.accountId === c.accountId);
  if (c.sessionId && c.sessionStartedAt && !own.some((l) => l.id === c.sessionId)) {
    own.push({ id: c.sessionId, label: liveLabel(c.sessionStartedAt, c.handle), accountId: c.accountId });
  }
  return own;
}

/** Customers as cards: name, phone, which documents are in, Open + Edit. */
export function CustomerList({
  rows,
  lives,
  showLive,
}: {
  rows: CustomerRow[];
  lives: (LiveChoice & { accountId: string })[];
  showLive: boolean;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No customers yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((c) => {
        const counts = c.fileCounts;
        const complete = isComplete(counts);
        return (
          <li
            key={c.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {c.customerName}
                </p>
                <p className="mt-0.5 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                  {localPhone(c.phone)}
                </p>
                {showLive && (
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {c.sessionStartedAt ? liveLabel(c.sessionStartedAt, c.handle) : `@${c.handle}`}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  complete
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : c.totalFiles > 0
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {complete ? "Complete" : c.totalFiles > 0 ? "Incomplete" : "No files"}
              </span>
            </div>

            <ul className="mt-3 flex flex-wrap gap-2">
              {DOC_TYPES.map((d) => {
                const n = counts?.[d.key] ?? 0;
                return (
                  <li
                    key={d.key}
                    className={`rounded-lg px-2.5 py-1 text-sm ${
                      n > 0
                        ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500"
                    }`}
                  >
                    {n > 0 ? "✅" : "⬜"} {d.label}
                    {n > 1 ? ` (${n})` : ""}
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2 dark:border-zinc-900">
              {c.folderId ? (
                <a
                  href={folderUrl(c.folderId)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-600 active:text-blue-800 dark:text-blue-400"
                >
                  Open folder →
                </a>
              ) : (
                <span className="text-sm text-zinc-500">Making folder…</span>
              )}
              <CustomerSheet
                mode="edit"
                lives={editLives(lives, c)}
                customer={{
                  id: c.id,
                  name: c.customerName,
                  phone: localPhone(c.phone),
                  sessionId: c.sessionId,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
