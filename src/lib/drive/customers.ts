/**
 * Customer document folders — the db side. A streamer taps New customer; this
 * makes `<day>/<name phone>/{IC,Payslip,Bank Statement}` in the handle's Shared
 * Drive, then counts the files in it so the live's Document Collect fills
 * itself (rule in core.ts → nextFilteredLeads).
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  customerFolders,
  driveDayFolders,
  tiktokAccounts,
  tiktokDriveLinks,
  tiktokLiveSessions,
} from "@/db/schema";
import type { CustomerFileCounts } from "@/db/schema/drive";
import { DriveError, savedDrive, type Drive } from "./client";
import {
  DOC_TYPES,
  customerFolderName,
  mytDay,
  nextFilteredLeads,
  tallyFiles,
  totalOf,
} from "./core";

/** A reserved row whose folders never got made (the request died) is retried after this. */
const STALE_RESERVATION_MS = 2 * 60_000;

export type CustomerRow = {
  id: string;
  accountId: string;
  handle: string;
  sessionId: string | null;
  sessionStartedAt: Date | null;
  customerName: string;
  phone: string;
  folderId: string | null;
  fileCounts: CustomerFileCounts | null;
  totalFiles: number;
  createdAt: Date;
};

const rowSelect = {
  id: customerFolders.id,
  accountId: customerFolders.accountId,
  handle: tiktokAccounts.handle,
  sessionId: customerFolders.sessionId,
  sessionStartedAt: tiktokLiveSessions.startedAt,
  customerName: customerFolders.customerName,
  phone: customerFolders.phone,
  folderId: customerFolders.folderId,
  fileCounts: customerFolders.fileCounts,
  totalFiles: customerFolders.totalFiles,
  createdAt: customerFolders.createdAt,
};

/**
 * Customers, newest first. `accountIds` is the streamer scope (undefined =
 * admin, every handle; an empty list = nothing).
 */
export async function listCustomers(opts: {
  accountIds?: string[];
  sessionId?: string;
  limit?: number;
}): Promise<CustomerRow[]> {
  if (opts.accountIds && opts.accountIds.length === 0) return [];
  return db
    .select(rowSelect)
    .from(customerFolders)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, customerFolders.accountId))
    .leftJoin(tiktokLiveSessions, eq(tiktokLiveSessions.id, customerFolders.sessionId))
    .where(
      and(
        opts.accountIds ? inArray(customerFolders.accountId, opts.accountIds) : undefined,
        opts.sessionId ? eq(customerFolders.sessionId, opts.sessionId) : undefined
      )
    )
    .orderBy(desc(customerFolders.createdAt))
    .limit(opts.limit ?? 200);
}

export type LiveOption = { id: string; accountId: string; handle: string; startedAt: Date };

/** Lives a new customer can be put under: the last 14 days, newest first. */
export async function recentLives(accountIds?: string[]): Promise<LiveOption[]> {
  if (accountIds && accountIds.length === 0) return [];
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const rows = await db
    .select({
      id: tiktokLiveSessions.id,
      accountId: tiktokLiveSessions.accountId,
      handle: tiktokAccounts.handle,
      startedAt: tiktokLiveSessions.startedAt,
    })
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .where(
      and(
        isNotNull(tiktokLiveSessions.startedAt),
        sql`${tiktokLiveSessions.startedAt} >= ${since}`,
        accountIds ? inArray(tiktokLiveSessions.accountId, accountIds) : undefined
      )
    )
    .orderBy(desc(tiktokLiveSessions.startedAt))
    .limit(60);
  return rows.filter((r): r is LiveOption => r.startedAt !== null);
}

/** Handle ids that have a Shared Drive linked. */
export async function linkedAccountIds(): Promise<Set<string>> {
  const rows = await db.select({ id: tiktokDriveLinks.accountId }).from(tiktokDriveLinks);
  return new Set(rows.map((r) => r.id));
}

/** The day's folder in a Shared Drive — found, or made once under a lock. */
async function dayFolder(drive: Drive, sharedDriveId: string, day: string): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`drive-day:${sharedDriveId}:${day}`}))`);
    const known = await tx.query.driveDayFolders.findFirst({
      where: and(eq(driveDayFolders.sharedDriveId, sharedDriveId), eq(driveDayFolders.day, day)),
    });
    if (known) return known.folderId;
    // An admin may have made it by hand; reuse theirs rather than add a twin.
    const folderId =
      (await drive.findFolder(sharedDriveId, sharedDriveId, day)) ??
      (await drive.createFolder(day, sharedDriveId));
    await tx.insert(driveDayFolders).values({ sharedDriveId, day, folderId }).onConflictDoNothing();
    return folderId;
  });
}

export type CreateResult = { created: boolean; id: string; folderId: string };

/**
 * Make a customer's folders. The same phone on the same handle returns the
 * folder that already exists instead of a second one.
 */
export async function createCustomer(input: {
  accountId: string;
  sessionId: string;
  name: string;
  phone: string;
  userId: string | null;
}): Promise<CreateResult> {
  const existing = await db.query.customerFolders.findFirst({
    where: and(eq(customerFolders.accountId, input.accountId), eq(customerFolders.phone, input.phone)),
  });
  if (existing?.folderId) return { created: false, id: existing.id, folderId: existing.folderId };
  if (existing) {
    // Someone else is making it right now — or a request died half way.
    if (Date.now() - existing.updatedAt.getTime() < STALE_RESERVATION_MS) {
      throw new DriveError("This customer's folder is being made. Try again in a moment.", 409);
    }
    await db.delete(customerFolders).where(eq(customerFolders.id, existing.id));
  }

  const link = await db.query.tiktokDriveLinks.findFirst({
    where: eq(tiktokDriveLinks.accountId, input.accountId),
  });
  if (!link) throw new DriveError("This TikTok account has no Google Drive yet. Ask an admin.", 409);
  const drive = await savedDrive();

  // Reserve the phone first, so two taps can't make two folders.
  const [reserved] = await db
    .insert(customerFolders)
    .values({
      accountId: input.accountId,
      sessionId: input.sessionId,
      customerName: input.name,
      phone: input.phone,
      sharedDriveId: link.sharedDriveId,
      createdBy: input.userId,
    })
    .onConflictDoNothing()
    .returning({ id: customerFolders.id });
  if (!reserved) throw new DriveError("This customer's folder is being made. Try again in a moment.", 409);

  try {
    const parent = await dayFolder(drive, link.sharedDriveId, mytDay(new Date()));
    const folderId = await drive.createFolder(customerFolderName(input.name, input.phone), parent);
    const [ic, payslip, bankStatement] = await Promise.all(
      DOC_TYPES.map((d) => drive.createFolder(d.label, folderId))
    );
    await db
      .update(customerFolders)
      .set({
        folderId,
        subfolders: { ic, payslip, bankStatement },
        fileCounts: { ic: 0, payslip: 0, bankStatement: 0, other: 0 },
        filesCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customerFolders.id, reserved.id));
    return { created: true, id: reserved.id, folderId };
  } catch (err) {
    await db.delete(customerFolders).where(eq(customerFolders.id, reserved.id));
    throw err;
  }
}

/**
 * Change a customer's name, phone or live. The Drive folder is renamed to
 * match; it stays in the day folder it was made in.
 */
export async function updateCustomer(
  id: string,
  change: { name: string; phone: string; sessionId: string }
): Promise<void> {
  const row = await db.query.customerFolders.findFirst({ where: eq(customerFolders.id, id) });
  if (!row) throw new DriveError("Not found.", 404);
  if (change.phone !== row.phone) {
    const clash = await db.query.customerFolders.findFirst({
      where: and(eq(customerFolders.accountId, row.accountId), eq(customerFolders.phone, change.phone)),
      columns: { id: true },
    });
    if (clash) throw new DriveError("Another customer already has that phone.", 409);
  }
  if (row.folderId && (change.name !== row.customerName || change.phone !== row.phone)) {
    const drive = await savedDrive();
    await drive.rename(row.folderId, customerFolderName(change.name, change.phone));
  }
  await db
    .update(customerFolders)
    .set({
      customerName: change.name,
      phone: change.phone,
      sessionId: change.sessionId,
      updatedAt: new Date(),
    })
    .where(eq(customerFolders.id, id));
  await applyDocCounts([row.sessionId, change.sessionId].filter((s): s is string => !!s));
}

/**
 * Re-count files for these customers (one Drive call per 10 customers per
 * Shared Drive), then refresh their lives' Document Collect.
 */
export async function recountCustomers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await db
    .select()
    .from(customerFolders)
    .where(and(inArray(customerFolders.id, ids), isNotNull(customerFolders.folderId)));
  if (rows.length === 0) return;
  const drive = await savedDrive();

  const byDrive = new Map<string, typeof rows>();
  for (const r of rows) byDrive.set(r.sharedDriveId, [...(byDrive.get(r.sharedDriveId) ?? []), r]);

  const now = new Date();
  for (const [sharedDriveId, list] of byDrive) {
    const parents = list.flatMap((r) =>
      r.subfolders ? [r.folderId!, r.subfolders.ic, r.subfolders.payslip, r.subfolders.bankStatement] : [r.folderId!]
    );
    const files = await drive.filesIn(sharedDriveId, parents);
    for (const r of list) {
      if (!r.subfolders) continue;
      const counts = tallyFiles(r.folderId!, r.subfolders, files);
      await db
        .update(customerFolders)
        .set({ fileCounts: counts, totalFiles: totalOf(counts), filesCheckedAt: now })
        .where(eq(customerFolders.id, r.id));
    }
  }
  await applyDocCounts(rows.map((r) => r.sessionId).filter((s): s is string => !!s));
}

/**
 * Re-count customers not checked in the last `olderThanMs` — the ones on screen
 * (scoped like listCustomers) or, for the daily job, everyone from the last 30 days.
 */
export async function recountStale(opts: {
  accountIds?: string[];
  sessionId?: string;
  olderThanMs: number;
  limit?: number;
}): Promise<number> {
  if (opts.accountIds && opts.accountIds.length === 0) return 0;
  const cutoff = new Date(Date.now() - opts.olderThanMs);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await db
    .select({ id: customerFolders.id })
    .from(customerFolders)
    .where(
      and(
        isNotNull(customerFolders.folderId),
        gte(customerFolders.createdAt, since),
        or(isNull(customerFolders.filesCheckedAt), lt(customerFolders.filesCheckedAt, cutoff)),
        opts.accountIds ? inArray(customerFolders.accountId, opts.accountIds) : undefined,
        opts.sessionId ? eq(customerFolders.sessionId, opts.sessionId) : undefined
      )
    )
    .orderBy(desc(customerFolders.createdAt))
    .limit(opts.limit ?? 100);
  await recountCustomers(rows.map((r) => r.id));
  return rows.length;
}

/** Write each live's Drive count, and Filtered Leads where it may follow it. */
async function applyDocCounts(sessionIds: string[]): Promise<void> {
  for (const sessionId of [...new Set(sessionIds)]) {
    const [s] = await db
      .select({
        filteredLeads: tiktokLiveSessions.filteredLeads,
        docsAutoCount: tiktokLiveSessions.docsAutoCount,
        withFiles: sql<number>`(select count(*)::int from ${customerFolders} where ${customerFolders.sessionId} = ${tiktokLiveSessions.id} and ${customerFolders.totalFiles} > 0)`,
      })
      .from(tiktokLiveSessions)
      .where(eq(tiktokLiveSessions.id, sessionId));
    if (!s) continue;
    const filteredLeads = nextFilteredLeads(s.filteredLeads, s.docsAutoCount, s.withFiles);
    if (filteredLeads === s.filteredLeads && s.withFiles === s.docsAutoCount) continue;
    await db
      .update(tiktokLiveSessions)
      .set({ filteredLeads, docsAutoCount: s.withFiles, updatedAt: new Date() })
      .where(eq(tiktokLiveSessions.id, sessionId));
  }
}
