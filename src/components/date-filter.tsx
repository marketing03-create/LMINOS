import Link from "next/link";
import type { RangeChoice } from "@/lib/ads/account-metrics";

/**
 * Date-range filter: quick presets (7d/30d/90d/All) as links + a custom
 * start/end picker (native GET form). Works in server components — no client
 * JS. `extra` params (e.g. { by: "campaign" }) are preserved across both.
 */
export function DateFilter({
  basePath,
  choice,
  extra = {},
}: {
  basePath: string;
  choice: RangeChoice;
  extra?: Record<string, string | undefined>;
}) {
  const entries = Object.entries(extra).filter(
    ([, v]) => v != null && v !== ""
  ) as [string, string][];

  const presetHref = (key: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of entries) sp.set(k, v);
    sp.set("range", key);
    return `${basePath}?${sp.toString()}`;
  };

  const PRESETS: [string, string][] = [
    ["7d", "7 days"],
    ["30d", "30 days"],
    ["90d", "90 days"],
    ["all", "All time"],
  ];

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-md whitespace-nowrap ${
      active
        ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
        : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
    }`;

  const inputCls =
    "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm text-zinc-900 dark:text-zinc-100";

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {PRESETS.map(([k, l]) => (
        <Link
          key={k}
          href={presetHref(k)}
          className={chip(choice.mode === "preset" && choice.presetKey === k)}
        >
          {l}
        </Link>
      ))}

      <form method="get" action={basePath} className="flex flex-wrap items-center gap-1.5">
        {entries.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input
          type="date"
          name="start"
          defaultValue={choice.startStr}
          className={`${inputCls} min-w-0`}
          aria-label="Start date"
        />
        <span className="text-zinc-400">→</span>
        <input
          type="date"
          name="end"
          defaultValue={choice.endStr}
          className={`${inputCls} min-w-0`}
          aria-label="End date"
        />
        <button type="submit" className={chip(choice.mode === "custom")}>
          Apply
        </button>
      </form>
    </div>
  );
}
