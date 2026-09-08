"use client";

import { TIKTOK_PRODUCTS } from "@/lib/tiktok-live/products";

/**
 * Multi-select tick boxes for the loan product(s)/service(s) a live promoted.
 * A live can push several at once, so this returns an array. Renders as wrapping
 * chips that lay out cleanly on both laptop and mobile.
 *
 * The chips used to be 36px tall, which is the size a chip lands on when it is
 * designed beside a mouse: `py-2` around 14px text and nothing enforcing a
 * floor. On a phone that is a 36px target sitting in a wrapped row of four
 * neighbours with 8px of gap between them, and the two on the ends of a wrap
 * are the ones a thumb reaches worst. `min-h-11` (44px) is the fix, and it is a
 * floor rather than a fixed height on purpose - a label that wraps to two lines
 * in a narrow card still grows instead of clipping.
 *
 * `lg:min-h-0 lg:px-3.5` hands the laptop back exactly today's 36px chip. The
 * growth is real vertical space - three or four chips per row here, so 8px each
 * is a visible push on every form that embeds this (`AddPastLive`,
 * `ManualEntryForm`, `ScreenshotImporter`, the detail page's `ProductSelect`) -
 * and desktop in this redesign is additive-only: it does not get taller because
 * the phone needed room (P5). The horizontal half matters less but travels with
 * it, since padding is what sets a chip's rhythm once the height is free.
 *
 * `active:` is not decoration either. `hover:bg-zinc-50` is the only feedback an
 * unselected chip has today, and a thumb has no hover - so on a phone, tapping
 * a chip that is about to toggle looks identical to tapping dead space until
 * the state flips. The paired `active:bg-*` gives the press its own frame, and
 * `focus-visible:` gives the same answer to a keyboard, which the ring was
 * missing entirely on a control whose only other cue is a colour swap.
 *
 * What deliberately does NOT change: `toggle` still rebuilds the value by
 * filtering `TIKTOK_PRODUCTS`, so the array we emit is always in canonical
 * product order and always a subset of the five valid labels - the same
 * guarantee `filterTikTokProducts` enforces server-side before this reaches
 * `tiktok_live_sessions.products`. This is a styling pass; the selection
 * contract and the props are frozen.
 */
export function ProductPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(p: string) {
    if (disabled) return;
    // Keep the result in the canonical product order.
    const set = new Set(value);
    if (set.has(p)) set.delete(p);
    else set.add(p);
    onChange(TIKTOK_PRODUCTS.filter((x) => set.has(x)));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {TIKTOK_PRODUCTS.map((p) => {
        const on = value.includes(p);
        return (
          <button
            key={p}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => toggle(p)}
            disabled={disabled}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors active:scale-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950 lg:min-h-0 lg:px-3.5 ${
              on
                ? "border-transparent bg-blue-600 text-white active:bg-blue-700"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:active:bg-zinc-800"
            }`}
          >
            {on && <span aria-hidden>✓</span>}
            {p}
          </button>
        );
      })}
    </div>
  );
}
