"use client";

import { useRouter } from "next/navigation";

/**
 * Admin-only streamer picker on the Operations TikTok Live page. Filters the
 * sessions table to one handle (or "All streamers"), preserving the current date
 * range so the two controls don't reset each other.
 *
 * One control, resized with responsive prefixes only. It was a 38px box sharing
 * a wrapping header row with three other controls, which on a phone is both
 * under the 44px floor and under the 16px floor that stops iOS zooming the whole
 * viewport the moment a select is focused. `min-h-11 w-full text-base` fixes
 * both below `lg`; the `lg:` half hands every one of those decisions back, so
 * the box on a laptop measures exactly what it measures today. Nothing about the
 * navigation changed — same params, same merge, same push.
 */
export function HandleFilter({
  handles,
  value,
  preserve,
}: {
  handles: { id: string; handle: string }[];
  value: string;
  preserve: Record<string, string>;
}) {
  const router = useRouter();

  function onChange(next: string) {
    const params = new URLSearchParams(preserve);
    if (next && next !== "all") params.set("handle", next);
    const qs = params.toString();
    router.push(qs ? `/tiktok-live?${qs}` : "/tiktok-live");
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Choose a live streamer"
      className="min-h-11 w-full shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-medium text-zinc-900 sm:text-sm lg:min-h-0 lg:w-auto dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <option value="all">All streamers</option>
      {handles.map((h) => (
        <option key={h.id} value={h.id}>
          @{h.handle}
        </option>
      ))}
    </select>
  );
}
