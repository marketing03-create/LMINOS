/**
 * Poll a handle's live status (used by the worker monitor loop + the CLI
 * --watch mode to auto-connect when a stream starts). Node-only.
 */
import { TikTokLiveConnection } from "tiktok-live-connector";

export async function isHandleLive(handle: string): Promise<boolean> {
  const uniqueId = handle.replace(/^@+/, "");
  try {
    const conn = new TikTokLiveConnection(uniqueId);
    return await conn.fetchIsLive();
  } catch {
    return false;
  }
}
