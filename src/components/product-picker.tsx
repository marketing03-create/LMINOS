"use client";

import { TIKTOK_PRODUCTS } from "@/lib/tiktok-live/products";

/**
 * Multi-select tick boxes for the loan product(s)/service(s) a live promoted.
 * A live can push several at once, so this returns an array. Renders as wrapping
 * chips that lay out cleanly on both laptop and mobile.
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
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors active:scale-95 disabled:opacity-50 ${
              on
                ? "border-transparent bg-blue-600 text-white"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
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
