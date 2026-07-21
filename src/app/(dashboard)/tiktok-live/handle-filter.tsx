"use client";

import { useRouter } from "next/navigation";

/**
 * Admin-only streamer picker on the Operations TikTok Live page. Filters the
 * sessions table to one handle (or "All streamers"), preserving the current date
 * range so the two controls don't reset each other.
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
      className="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100"
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
