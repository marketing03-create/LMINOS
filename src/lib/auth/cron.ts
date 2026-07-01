import { type NextRequest } from "next/server";

/**
 * Authorize a cron request by the `Authorization: Bearer ${CRON_SECRET}` header.
 *
 * Fail-CLOSED: if CRON_SECRET is not configured, the request is DENIED (the
 * previous pattern failed open — an unset secret left the endpoint public).
 */
export function cronAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}
