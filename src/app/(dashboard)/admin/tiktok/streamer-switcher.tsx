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

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Switch to another live streamer"
      className="w-full max-w-full truncate rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
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
