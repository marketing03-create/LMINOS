"use client";

import { useRouter } from "next/navigation";
import { LeadsQuickSheet } from "@/components/mobile/leads-quick-sheet";

/**
 * The Home feed is a server component — it has to be, or two hundred session
 * rows cross the boundary a second time just to render a list. But
 * `LeadsQuickSheet` takes an `onSaved` callback, and a function is the one prop
 * a server component cannot hand a client one.
 *
 * So this is the four-line client shim that owns that callback. It exists for
 * exactly one reason: without a `router.refresh()` after the PATCH, the card
 * the streamer just filled in stays amber and still reads "Missing: Total
 * Leads" — she saved the number, the sheet closed, and the screen told her
 * nothing happened. `FeedRefresh` cannot cover this: it fires on arrival,
 * bfcache restore and tab focus, and saving inside a sheet is none of those.
 *
 * `router.refresh()` and not `location.reload()`: the feed re-renders in place
 * with fresh server data, keeping scroll position and the rest of the list
 * exactly where the thumb left it.
 */
export function LeadsQuickAction({
  sessionId,
  when,
  totalLeads,
  filteredLeads,
}: {
  sessionId: string;
  when: string;
  totalLeads: number | null;
  filteredLeads: number | null;
}) {
  const router = useRouter();
  return (
    <LeadsQuickSheet
      sessionId={sessionId}
      when={when}
      totalLeads={totalLeads}
      filteredLeads={filteredLeads}
      onSaved={() => router.refresh()}
    />
  );
}
