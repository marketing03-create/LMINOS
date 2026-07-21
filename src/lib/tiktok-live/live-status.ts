/**
 * Poll a handle's live status (used by the worker monitor loop + the CLI
 * --watch mode to auto-connect when a stream starts). Node-only.
 */
import { TikTokLiveConnection } from "tiktok-live-connector";
import { signConnectionOptions } from "./sign";

/** live = streaming now · offline = not live · error = couldn't reach TikTok. */
export type LiveProbe = "live" | "offline" | "error";

/**
 * Distinguish "not live" from "couldn't check" — the worker's self-heal watchdog
 * needs this: a burst of `error` results means the connection to TikTok is
 * broken (restart), whereas `offline` is perfectly healthy (nobody's live).
 */
export async function probeHandle(handle: string): Promise<LiveProbe> {
  const uniqueId = handle.replace(/^@+/, "");
  try {
    const conn = new TikTokLiveConnection(uniqueId, signConnectionOptions());
    return (await conn.fetchIsLive()) ? "live" : "offline";
  } catch {
    return "error";
  }
}

export async function isHandleLive(handle: string): Promise<boolean> {
  return (await probeHandle(handle)) === "live";
}
