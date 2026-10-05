import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";

/**
 * The Web Push PUBLIC key (VAPID). Public by design — browsers need it to
 * subscribe, and it is useless without the private key, which never leaves the
 * server. Served at runtime rather than inlined at build so a key added to
 * Vercel takes effect without depending on the build having seen it.
 * `null` = push is not configured; the "Turn on notifications" card stays hidden.
 */
export async function GET() {
  const env = serverEnv();
  const key = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
    ? env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    : null;
  return NextResponse.json({ key }, { headers: { "cache-control": "no-store" } });
}
