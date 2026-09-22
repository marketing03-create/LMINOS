"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/authorize";

/**
 * Throw away every page the browser has cached, not just the one on screen.
 *
 * next.config keeps visited pages for 30s (`staleTimes.dynamic`), and in this
 * Next version `router.refresh()` only clears the CURRENT route. So a streamer
 * who saved on a live's page and then went back to the list — or reopened the
 * live from it — was handed the copy from before the save: blank numbers,
 * "Missing: …", as if the save never happened. They re-uploaded the same
 * screenshots over and over. `revalidatePath` from a Server Function purges the
 * whole client cache and re-renders the current page in the same round trip.
 *
 * Signed-in only: it writes nothing, but an anonymous caller has no reason to
 * make us re-render anything.
 */
export async function refreshEverywhere(): Promise<void> {
  if (!(await getSessionUser())) return;
  revalidatePath("/", "layout");
}
