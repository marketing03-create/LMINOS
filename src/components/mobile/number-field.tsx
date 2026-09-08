"use client";

import { useId } from "react";

/**
 * The one numeric input in the app.
 *
 * We had seven of them. `session-screenshot-card`, `manual-entry-form` (twice:
 * `FieldGrid` and `LeadField`), `add-past-live`, `screenshot-importer` (twice)
 * and `manual-metrics-form` each grew their own `LABELS` map, their own
 * `inputCls`, and their own idea of how wide a number box should be — `w-24`,
 * `w-28`, `w-full`, at `text-[13px]`, `text-sm` and `text-base`. Six of those
 * seven sit at 13–14px, under the 16px threshold at which iOS Safari zooms the
 * viewport on focus; only `LeadField` was already at 16. A streamer entering
 * one live's numbers pinch-fights the page roughly eighteen times. That is the
 * main reason this file exists: `text-base sm:text-sm` is 16px on the phone and
 * the same 14px from `sm` up, where the existing forms already work.
 *
 * Honest caveat on that rule, and the reason it is not quietly "fixed" here:
 * `sm:` starts at 640px and a landscape iPhone is ~900px wide, so a phone
 * turned sideways gets the 14px box and the zoom comes back. The rule is
 * spec §2.3, applied identically by every input primitive in this folder;
 * moving to `lg:text-sm` is a decision for all of them at once, not for one
 * file to take on its own and desynchronise the set. Flagged, not patched.
 *
 * The second reason is the little grey line under each of those inputs. Today
 * it says `now —` when nothing has been entered yet, and `—` is indexed by a
 * reader as "zero, roughly". Leads are recorded on about a fifth of lives, so
 * that dash is the difference between "we haven't typed it in" and a public
 * verdict about a named streamer. Here the same slot says **Not entered**, in
 * words, and the AI-read value waiting to be saved shows as an explicit
 * `Now 1,234 → 1,340` so you can see what you are about to overwrite before
 * you commit to it — not after.
 *
 * The one dash left in the file is the input's own `placeholder`, which the
 * spec asks for by name, and it is not the P1 breach it looks like at a glance.
 * A placeholder is not a rendered metric: it is the shape of an empty box, it
 * vanishes the instant anything is typed, and the chip sitting beside it is
 * already saying "Not entered" in words. The P1 grep (`?? '—'`, `: '—'`) does
 * not match it, and it is the only place in the mobile tree where that glyph is
 * allowed to stand outside a `hidden lg:block` cell. Do not copy it anywhere it
 * would stand in for a value.
 *
 * Deliberately dumb about numbers: it takes a string and it reports a string.
 * No clamping, no rounding, no `Number()`. Callers keep their own
 * `Math.max(0, Math.round(Number(v)))` and their own "delete the key when the
 * box is blank" rule, because that rule is a save-payload decision, not an
 * input decision. **Blank means null. Blank never means 0** — if this
 * component ever starts coercing `""` to `0` it will silently write zeros over
 * real gaps in the database, which is the one failure mode nothing downstream
 * can detect.
 */

export type NumberFieldProps = {
  col: string;
  label: string;
  value: string;
  current?: number | null;
  pending?: number | null;
  onChange: (col: string, v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /**
   * Appended to the input's own classes. The default box is 48px on a phone and
   * ~32px from `lg` up, which preserves the desktop grids this replaces; pass
   * `lg:h-10` (or similar) only where a taller desktop control is a deliberate
   * decision, and say so at the call site.
   */
  inputClassName?: string;
};

const fmt = (n: number) => n.toLocaleString("en-MY");

export function NumberField({
  col,
  label,
  value,
  current,
  pending,
  onChange,
  disabled,
  autoFocus,
  inputClassName,
}: NumberFieldProps): React.JSX.Element {
  const uid = useId();
  const inputId = `nf-${uid}`;
  const chipId = `nf-${uid}-chip`;

  const hasCurrent = current != null;
  // An AI-read value only counts as "pending" while it actually differs from
  // what is already saved; re-showing an identical number as a change is noise.
  const hasPending = pending != null && pending !== current;

  return (
    <div className="w-full">
      {/* Label left, state chip right. The chip is 12px but it is allowed to
          wrap — a caveat is never truncated (§2.1), and `Now 1,234 → 1,340`
          is exactly the string that gets clipped today at 375px.
          `ml-auto text-right` is what keeps it right-aligned in the wrapped
          case: `justify-between` only separates items that share a line, so a
          chip pushed onto its own line by a long label would otherwise snap
          back to the left edge and read as a second label. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-zinc-700 dark:text-zinc-200"
        >
          {label}
        </label>
        <span
          id={chipId}
          className="ml-auto text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400"
        >
          {hasCurrent ? (
            <>Now {fmt(current)}</>
          ) : (
            // The same words `NotEntered` renders, not the component itself:
            // its `text` variant is hard-coded `text-sm`, and in Tailwind v4 a
            // `text-xs` passed via className cannot beat it — both are font-size
            // utilities in one layer, so stylesheet order (text-xs first, then
            // text-sm) decides, not the order they appear in the attribute. A
            // 12px chip set in 14px would break the type scale, silently.
            <span className="italic">Not entered</span>
          )}
          {hasPending && (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              <span aria-hidden="true"> → </span>
              <span className="sr-only"> changing to </span>
              {fmt(pending)}
            </span>
          )}
        </span>
      </div>

      {/* Height is 48px on a phone and ~32px from `lg` up, and the `lg:` half is
          not optional. The fields this replaces are `px-2 py-1 text-sm`
          (manual-metrics-form, ~30px) and `px-2 py-1.5 text-sm`
          (session-screenshot-card, ~34px); an unqualified `h-12` would grow all
          18 boxes of a desktop two-column grid by half again, which is exactly
          the desktop regression P5 exists to prevent.

          The temptation is to leave it unqualified and let each route owner add
          `lg:h-8`. That is the mistake `Disclosure` already argues against: a
          prop can be forgotten at one call site, a default cannot. So the safe
          height is the default, and a route that genuinely wants a taller
          desktop control overrides it deliberately via `inputClassName`.

          The placeholder is a step darker than the usual zinc-300/700 pair: it
          is decorative, but at 1.9:1 it was invisible rather than quiet, so the
          empty box read as broken instead of empty. */}
      <input
        id={inputId}
        name={col}
        type="text"
        inputMode="numeric"
        enterKeyHint="next"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(col, e.target.value)}
        disabled={disabled}
        placeholder="—"
        aria-describedby={chipId}
        className={`mt-1 h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-right text-base tabular-nums text-zinc-900 placeholder:text-zinc-400 active:border-zinc-400 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm lg:h-8 lg:rounded-md lg:px-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:active:border-zinc-500${
          inputClassName ? ` ${inputClassName}` : ""
        }`}
      />
    </div>
  );
}
