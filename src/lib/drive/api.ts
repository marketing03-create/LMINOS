/**
 * Shared by the customer-folder routes: who may touch which handle, and how a
 * DriveError becomes a response.
 */
import { NextResponse } from "next/server";
import { ADMIN_ROLES, requireRole, type AuthOk } from "@/lib/auth/authorize";
import { streamerAccountIds } from "@/lib/tiktok-live/queries";
import { DriveError } from "./client";

export const CUSTOMER_ROLES = ["live_streamer" as const, ...ADMIN_ROLES];

/**
 * The handles this caller may work with: their own for a streamer (an empty
 * list when the id is missing — fail closed), undefined (= all) for an admin.
 */
export async function scopeFor(auth: AuthOk): Promise<string[] | undefined> {
  if (auth.role !== "live_streamer") return undefined;
  return auth.userId ? streamerAccountIds(auth.userId) : [];
}

export function inScope(scope: string[] | undefined, accountId: string): boolean {
  return !scope || scope.includes(accountId);
}

export async function requireCustomerRole() {
  return requireRole(CUSTOMER_ROLES);
}

export function errorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof DriveError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  console.error(`[drive] ${where} failed:`, err);
  return NextResponse.json({ ok: false, error: "Something went wrong. Try again." }, { status: 500 });
}
