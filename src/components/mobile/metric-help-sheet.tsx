"use client";

import { useCallback, useEffect, useState } from "react";
import { Sheet } from "@/components/mobile/sheet";
import { METRIC_HELP, type MetricHelpKey } from "@/lib/tiktok-live/metric-help";

/**
 * One "What do these mean?" chip per screen, instead of a "?" beside every
 * label.
 *
 * The counting that forced this: a streamer with 20 lives in a week is served
 * roughly 103 inline `?` buttons on Home. Each one is a 16px circle, and five
 * of them sit *inside* the tappable card `Link` for every card. On a laptop
 * that is a tidy affordance you use once a month. On a phone it is a hundred
 * targets you cannot reliably hit, in front of the numbers you actually came
 * to read, and the explanation itself then lands in a 240px popover — narrower
 * than the phone holding it.
 *
 * So below `lg` the tips collapse: `HelpTip` call sites go `hidden lg:inline-flex`
 * (§4.16, desktop untouched) and each screen mounts exactly one 44px chip that
 * opens the whole set at once, at 15px, in a scrollable sheet. Reading five
 * definitions in a row is also the honest use case — nobody wonders what
 * "Filtered Leads" means without also wondering about "Total Leads".
 *
 * The text is read straight out of `METRIC_HELP` and never copied, which is the
 * point of that module: admin and streamer cannot end up with different words
 * for the same number. The labels are the other half of that promise, so they
 * live here as a `Record<MetricHelpKey, string>` — typed, so adding a metric to
 * `METRIC_HELP` without naming it breaks the build rather than shipping a
 * sentence with no subject.
 *
 * Trade-off worth stating: a chip is one tap further away than a `?` sitting on
 * the label, and it does not tell you *which* number you are curious about. We
 * take that, because the alternative on a 375px screen is an affordance that
 * technically exists and practically cannot be used.
 */

/**
 * Names for the sentences in `METRIC_HELP`. Wording is lifted from the labels
 * these keys already carry on screen (`sessions-table` headers, `overview-header`
 * stats, `data-quality` sub-headings) so the sheet reads like the page it was
 * opened from — not like a glossary someone wrote separately.
 */
export const METRIC_HELP_LABEL: Record<MetricHelpKey, string> = {
  duration: "Duration",
  views: "Views",
  peak: "Peak viewers",
  avg: "Average viewers",
  followers: "New followers",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  unique: "Unique viewers",
  active: "Active viewers",
  watch: "Watch time",
  dms: "DMs",
  bioViews: "Bio views",
  interested: "Interested",
  diamonds: "Diamonds",
  commentLeads: "Comment leads",
  totalLeads: "Total Leads",
  filteredLeads: "Filtered Leads",
  sessions: "Lives",
  liveHours: "Live hours",
  leadQuality: "Lead Quality",
  coverage: "Data quality",
  autoCoverage: "Captured automatically",
  combineBy: "Combine by",
  viewsPerLiveHour: "Views / live hr",
  followersPerLiveHour: "Followers / live hr",
  leadsPerLiveHour: "Leads per hour streamed",
  leadsPer1kViews: "Leads per 1,000 views",
  partOfDay: "Part of day",
  timeOfDayLeads: "Leads by time of day",
  streamerTable: "Streamers side by side",
  keywordCapture: "Keyword capture",
  topLives: "Top lives",
  notRecorded: "Not entered",
  productTagging: "Product tagging",
  chaseList: "Lives still missing numbers",
  connectorMiss: "Possible capture failure",
};

const DEFAULT_LABEL = "What do these mean?";

/** Callers assemble their list by hand; the same key twice would read as a bug. */
function unique(keys: MetricHelpKey[]): MetricHelpKey[] {
  return Array.from(new Set(keys));
}

export type MetricHelpSheetProps = {
  keys: MetricHelpKey[];
  open: boolean;
  onClose: () => void;
  /** Doubles as the dialog heading; defaults to the chip's own wording. */
  title?: string;
};

/**
 * The sheet on its own, for the screens that already own a trigger (a section
 * header's info button, a form's "about these fields" link) and only need the
 * body. `HelpChip` is this plus the standard 44px trigger.
 */
export function MetricHelpSheet({
  keys,
  open,
  onClose,
  title = DEFAULT_LABEL,
}: MetricHelpSheetProps): React.JSX.Element | null {
  const items = unique(keys);
  if (items.length === 0) return null;

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {/* A definition list, run-in: "Label — sentence". The label carries the
          weight so it still reads as the subject once the sentence wraps to
          three lines, which at 375px it usually does.

          `tabIndex={0}` is not decoration. This is the only Sheet whose body is
          entirely non-interactive, so without it the panel contains exactly one
          focusable thing — the Close button in the header, outside the scroll
          box. A keyboard or switch user would then have no way to scroll a list
          that is taller than 85dvh from eight keys upward: arrow keys scroll the
          nearest scrollable ancestor of the focused element, and nothing focusable
          lives inside it. Making the list itself focusable puts it in `Sheet`'s
          trap (its FOCUSABLE selector already matches `[tabindex]`) and hands the
          arrow keys the right scroll container. */}
      <dl
        tabIndex={0}
        className="space-y-4 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        {items.map((key) => (
          <div key={key} className="text-[15px] leading-relaxed">
            <dt className="inline font-semibold text-zinc-900 dark:text-zinc-100">
              {METRIC_HELP_LABEL[key]}
            </dt>
            <dd className="ml-0 inline text-zinc-600 dark:text-zinc-400">
              {" \u2014 "}
              {METRIC_HELP[key]}
            </dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}

export type HelpChipProps = {
  keys: MetricHelpKey[];
  /** Defaults to "What do these mean?". */
  label?: string;
};

/**
 * The one help affordance on a mobile screen. `lg:hidden`, because at `lg` the
 * per-label `HelpTip`s are back and this would be a second, worse route to the
 * same words.
 */
export function HelpChip({ keys, label }: HelpChipProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const items = unique(keys);
  const text = label ?? DEFAULT_LABEL;

  // Stable, because `Sheet` lists `onClose` in the deps of its Escape/Tab
  // effect: a fresh arrow function every render would tear that document
  // listener down and re-add it on every render the sheet is open.
  const close = useCallback(() => setOpen(false), []);

  // The chip is `lg:hidden`, so widening the window to desktop leaves the sheet
  // open with nothing to close it from and no trigger to restore focus to.
  // Close it at the same breakpoint the chip disappears at.
  //
  // Subscribe only — no synchronous "are we already at lg?" check. The trigger
  // is `display:none` at `lg`, so `open` can only ever be set from below the
  // breakpoint; the check would be dead code, and setting state straight from
  // an effect body is a lint error in this repo besides.
  //
  // `64rem`, not `1024px`. Tailwind's `lg` variant compiles to `min-width:
  // 64rem`, and a media-query `rem` resolves against the browser's *default*
  // font size, not ours — so a reader who has set 20px text sees `lg:hidden`
  // kick in at 1280 CSS px. Hard-coding 1024px would close the sheet under a
  // chip that is still on screen. Same unit as the class, or it is not "the
  // same breakpoint".
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 64rem)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open]);

  // No keys, no chip. A control that opens an empty sheet is worse than nothing.
  if (items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Same guard `HelpTip` carries (help-tip.tsx:66) and for the same
          // reason: a section header that also happens to be a `RecordCard`
          // `Link` would otherwise navigate away the instant you asked what a
          // number means. Costs nothing when the chip stands alone.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-zinc-300 px-4 text-sm text-zinc-600 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 lg:hidden dark:border-zinc-700 dark:text-zinc-400 dark:active:bg-zinc-800"
      >
        {/* Drawn, not typed: the `?` glyph would have to be set at 10px to fit
            a 16px ring, and sub-12px type is banned below `lg` (§2.1). */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="shrink-0"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.6 9.2a2.5 2.5 0 1 1 3.2 2.6c-.5.2-.8.7-.8 1.2v.5" />
          <path d="M12 16.8h.01" />
        </svg>
        {text}
      </button>
      <MetricHelpSheet keys={items} open={open} onClose={close} title={text} />
    </>
  );
}
