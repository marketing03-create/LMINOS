/**
 * Google Drive, as the TT Stars service account. Plain fetch + a self-signed
 * JWT (no googleapis dependency): the service account is a member of each
 * handle's Shared Drive, so everything here passes `supportsAllDrives`.
 *
 * Only folder names, ids and file parents are ever requested (`fields=`) — no
 * file content is read or downloaded.
 */
import { createSign } from "node:crypto";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { driveSettings } from "@/db/schema";
import { decryptToken } from "@/lib/crypto/envelope";
import type { ServiceAccount } from "./core";

const API = "https://www.googleapis.com/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER = "application/vnd.google-apps.folder";

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status = 500
  ) {
    super(message);
  }
}

/** The saved service account, or null when an admin hasn't connected one. */
export async function loadServiceAccount(): Promise<ServiceAccount | null> {
  const row = await db.query.driveSettings.findFirst({ orderBy: desc(driveSettings.updatedAt) });
  if (!row) return null;
  return { clientEmail: row.clientEmail, privateKey: decryptToken(row.privateKeyEnc) };
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

let cached: { email: string; token: string; expires: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.email === sa.clientEmail && cached.expires > Date.now() + 60_000) {
    return cached.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(sa.privateKey, "base64url");
  } catch {
    throw new DriveError("The saved Google key can't be read. Paste the JSON key again.", 400);
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${claims}.${signature}`,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !j.access_token) {
    throw new DriveError("Google refused the service account key. Check it isn't deleted or disabled.", 400);
  }
  cached = { email: sa.clientEmail, token: j.access_token, expires: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

/** Throws a DriveError unless Google issues a token for this key. */
export async function verifyKey(sa: ServiceAccount): Promise<void> {
  await accessToken(sa);
}

export type Drive = ReturnType<typeof driveFor>;

/** Drive calls bound to one service account. */
export function driveFor(sa: ServiceAccount) {
  async function call<T>(path: string, init?: RequestInit & { query?: Record<string, string> }): Promise<T> {
    // Every /files call works on Shared Drives; /drives takes no such flag.
    const q = new URLSearchParams({
      ...(path.startsWith("/files") ? { supportsAllDrives: "true" } : {}),
      ...init?.query,
    });
    const res = await fetch(`${API}${path}?${q}`, {
      ...init,
      headers: {
        authorization: `Bearer ${await accessToken(sa)}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
    if (!res.ok) {
      // Google's own message, without anything from the request.
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      const msg = j?.error?.message ?? res.statusText;
      if (res.status === 404) {
        throw new DriveError(
          `Google Drive: not found. Add ${sa.clientEmail} to the Shared Drive as Content manager.`,
          404
        );
      }
      if (res.status === 403) throw new DriveError(`Google Drive refused: ${msg}`, 403);
      throw new DriveError(`Google Drive error: ${msg}`, 502);
    }
    return (await res.json()) as T;
  }

  return {
    email: sa.clientEmail,

    async createFolder(name: string, parentId: string): Promise<string> {
      const f = await call<{ id: string }>("/files", {
        method: "POST",
        body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
        query: { fields: "id" },
      });
      return f.id;
    },

    async rename(fileId: string, name: string): Promise<void> {
      await call(`/files/${encodeURIComponent(fileId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
        query: { fields: "id" },
      });
    },

    /** A folder called `name` directly inside `parentId`, if there is one. */
    async findFolder(driveId: string, parentId: string, name: string): Promise<string | null> {
      const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const r = await call<{ files: { id: string }[] }>("/files", {
        query: {
          corpora: "drive",
          driveId,
          includeItemsFromAllDrives: "true",
          q: `'${parentId}' in parents and name = '${escaped}' and mimeType = '${FOLDER}' and trashed = false`,
          fields: "files(id)",
          pageSize: "1",
        },
      });
      return r.files[0]?.id ?? null;
    },

    /** Every non-folder file whose parent is one of `parentIds`. */
    async filesIn(driveId: string, parentIds: string[]): Promise<{ parents?: string[] }[]> {
      const out: { parents?: string[] }[] = [];
      // Drive's query string has a length limit — 40 parents per call is well inside it.
      for (let i = 0; i < parentIds.length; i += 40) {
        const chunk = parentIds.slice(i, i + 40);
        const inParents = chunk.map((p) => `'${p}' in parents`).join(" or ");
        let pageToken: string | undefined;
        do {
          const r = await call<{ files: { parents?: string[] }[]; nextPageToken?: string }>("/files", {
            query: {
              corpora: "drive",
              driveId,
              includeItemsFromAllDrives: "true",
              q: `(${inParents}) and mimeType != '${FOLDER}' and trashed = false`,
              fields: "nextPageToken,files(parents)",
              pageSize: "1000",
              ...(pageToken ? { pageToken } : {}),
            },
          });
          out.push(...r.files);
          pageToken = r.nextPageToken;
        } while (pageToken);
      }
      return out;
    },

    /**
     * The Shared Drive's name, or a DriveError when the service account isn't a
     * member — or is one that can't add folders (needs Content manager).
     */
    async checkSharedDrive(driveId: string): Promise<string> {
      const d = await call<{ name?: string; capabilities?: { canAddChildren?: boolean } }>(
        `/drives/${encodeURIComponent(driveId)}`,
        { query: { fields: "name,capabilities(canAddChildren)" } }
      );
      if (!d.capabilities?.canAddChildren) {
        throw new DriveError(
          `${sa.clientEmail} can't add folders there. Make it Content manager on the Shared Drive.`,
          403
        );
      }
      return d.name ?? driveId;
    },
  };
}

/** Drive for the saved service account; a DriveError when none is saved. */
export async function savedDrive() {
  const sa = await loadServiceAccount();
  if (!sa) throw new DriveError("Google Drive isn't connected yet. Ask an admin.", 409);
  return driveFor(sa);
}
