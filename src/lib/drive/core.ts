/**
 * Customer document folders — the pure part. No db, no network, so the rules
 * (names, the counting, when Filtered Leads may be overwritten) are pinned in
 * tests. lib/drive/client.ts talks to Google; lib/drive/customers.ts to the db.
 */
import type { CustomerFileCounts, CustomerSubfolders } from "@/db/schema/drive";

/** The three document subfolders every customer gets, in display order. */
export const DOC_TYPES = [
  { key: "ic", label: "IC" },
  { key: "payslip", label: "Payslip" },
  { key: "bankStatement", label: "Bank Statement" },
] as const satisfies readonly { key: keyof CustomerSubfolders; label: string }[];

export type DocKey = (typeof DOC_TYPES)[number]["key"];

export const EMPTY_COUNTS: CustomerFileCounts = { ic: 0, payslip: 0, bankStatement: 0, other: 0 };

/** "2026-11-04" — the Malaysia date of `at`. */
export function mytDay(at: Date): string {
  return new Date(at.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** 60123456789 → "0123456789" (how a Malaysian number is written). */
export function localPhone(intl: string): string {
  return intl.startsWith("60") ? `0${intl.slice(2)}` : `+${intl}`;
}

/** A customer name as typed, tidied: one space between words, at most 80 chars. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 80);
  return name.length >= 2 ? name : null;
}

/** "Ahmad bin Ali 0123456789". Drive allows any character, so no escaping. */
export function customerFolderName(name: string, phoneIntl: string): string {
  return `${name} ${localPhone(phoneIntl)}`;
}

/**
 * A Shared Drive id from what an admin pastes: the id itself, or the drive's
 * URL (https://drive.google.com/drive/folders/0AB…, sometimes /u/1/…).
 */
export function parseSharedDriveId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const fromUrl = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  const id = fromUrl ? fromUrl[1] : s;
  return /^[A-Za-z0-9_-]{10,100}$/.test(id) ? id : null;
}

export type ServiceAccount = { clientEmail: string; privateKey: string };

/** The fields TT Stars needs from a service account's downloaded JSON key. */
export function parseServiceAccountJson(raw: unknown): ServiceAccount | null {
  if (typeof raw !== "string") return null;
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const clientEmail = typeof o.client_email === "string" ? o.client_email.trim() : "";
  const privateKey = typeof o.private_key === "string" ? o.private_key : "";
  if (o.type !== "service_account") return null;
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(clientEmail)) return null;
  if (!privateKey.includes("BEGIN PRIVATE KEY")) return null;
  return { clientEmail, privateKey };
}

export const folderUrl = (folderId: string) =>
  `https://drive.google.com/drive/folders/${folderId}`;

/**
 * Tally files by the folder they sit in. `parents` is each file's parent ids
 * (Drive returns one for Shared Drive files); a file in a folder that isn't one
 * of the customer's is ignored.
 */
export function tallyFiles(
  folderId: string,
  subfolders: CustomerSubfolders,
  files: { parents?: string[] }[]
): CustomerFileCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const f of files) {
    for (const p of f.parents ?? []) {
      if (p === subfolders.ic) counts.ic++;
      else if (p === subfolders.payslip) counts.payslip++;
      else if (p === subfolders.bankStatement) counts.bankStatement++;
      else if (p === folderId) counts.other++;
    }
  }
  return counts;
}

export function totalOf(c: CustomerFileCounts): number {
  return c.ic + c.payslip + c.bankStatement + c.other;
}

/** All three document types have at least one file. */
export function isComplete(c: CustomerFileCounts | null): boolean {
  return !!c && c.ic > 0 && c.payslip > 0 && c.bankStatement > 0;
}

/**
 * What Filtered Leads ("Document Collect") becomes after a Drive recount.
 *
 * It follows the folder count while nobody has typed over it — blank, or still
 * the number the last recount wrote. A different number a person typed stays;
 * the Drive count is still recorded next to it. A blank stays blank while no
 * folder has a file yet, so the "Missing" reminder isn't silenced by a 0.
 */
export function nextFilteredLeads(
  filteredLeads: number | null,
  lastAuto: number | null,
  driveCount: number
): number | null {
  if (filteredLeads === null) return driveCount > 0 ? driveCount : null;
  if (filteredLeads === lastAuto) return driveCount;
  return filteredLeads;
}
