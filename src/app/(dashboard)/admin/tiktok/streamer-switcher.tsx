"use client";

import { useRouter } from "next/navigation";

/**
 * Jump straight to another streamer's results from the streamer detail page —
 * replaces the old "← Choose another streamer" round-trip via the chooser.
 *
 * A NATIVE <select> on purpose: every device renders its own picker (the iOS
 * wheel, the Android sheet, the OS menu on desktop), so it can't look broken the
 * way a hand-rolled dropdown does on mobile. Matches the HandleFilter pattern
 * already used on the Operations page.
 *
 * The current date range is carried across, so switching streamer compares the
 * same period instead of silently resetting it.
 */
export function StreamerSwitcher({
  handles,
  value,
  preserve,
}: {
  handles: { id: string; handle: string }[];
  /** The account id currently being viewed, or "all". */
  value: string;
  /** Date-range params to keep (range/start/end). */
  preserve: Record<string, string>;
}) {
  const router = useRouter();

  function onChange(next: string) {
    const qs = new URLSearchParams(preserve).toString();
    const base = next === "all" ? "/admin/tiktok/all" : `/admin/tiktok/${next}`;
    router.push(qs ? `${base}?${qs}` : base);
  }

  /*
   * Two mobile-only corrections, both scoped so the desktop control keeps the
   * 38px box it has today — `lg:min-h-0` hands the height back to `py-2`, and
   * `sm:text-sm` restores 14px well before `lg` ever applies:
   *
   *  - 38px is a miss on a 44px thumb, and this select is the only way off this
   *    page to another streamer, so a mis-tap costs a whole round trip.
   *  - a sub-16px <select> makes iOS Safari zoom the viewport on focus, and it
   *    does not zoom back out. Every number on the page is then read at 1.2x,
   *    panning sideways.
   */
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Switch to another live streamer"
      className="min-h-11 w-full max-w-full truncate rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-medium text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:text-sm lg:min-h-0 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <option value="all">All streamers (combined)</option>
      {handles.map((h) => (
        <option key={h.id} value={h.id}>
          @{h.handle}
        </option>
      ))}
    </select>
  );
}
