"use client";

import { useId } from "react";

/**
 * The Save bar for every long form in the app.
 *
 * The problem it solves is dull and expensive: our forms are long — eighteen
 * numeric fields in `ManualMetricsForm`, sixteen in `AddPastLive` — and the
 * button that commits them is a ~36px control sitting at the very bottom.
 * On a phone that means a streamer types the last number, sees nothing that
 * looks finished, and has to scroll past everything they just filled in to
 * find a small dark pill. The commonest failure is not a mis-tap; it is
 * walking away from a filled-in form that was never saved.
 *
 * So the action follows the thumb. Three details are load-bearing:
 *
 *  - **The offset is a variable, not a number.** `ManualEntryForm` already had
 *    a sticky Save, hard-coded to `calc(env(safe-area-inset-bottom) + 4rem)`.
 *    That 4rem is the streamer tab bar, which does not exist for an admin and
 *    does not exist at `lg`, so the same literal is both correct and wrong
 *    depending on who is looking. `--lmiros-bottom-bar` is published by the
 *    shell (0 by default, 4rem only when a tab bar is actually mounted below
 *    `lg`), so this bar lands just above whatever furniture is really there.
 *    Both halves carry an explicit `0px` fallback, because an undefined custom
 *    property poisons the whole `calc()` — `bottom` would silently fall back to
 *    `auto` and the bar would quietly stop sticking, which is the one failure
 *    nobody would file a bug for.
 *
 *  - **`sm:static`.** Above `sm` there is room for the button to just end the
 *    form the way it always has; pinning it there would be a desktop
 *    regression for no gain. Everything that makes it a bar — the backdrop,
 *    the top border, the full-bleed negative margin — is switched off in the
 *    same breakpoint jump.
 *
 *  - **The full-bleed `-mx-4` assumes the page pads with `px-4`**, which is
 *    the standard page padding in this spec. It is deliberate: a floating bar
 *    inset by 16px lets the form scroll through the gap at its edges and read
 *    as unfinished text sliding under a card. If you drop this into a
 *    container with different horizontal padding, wrap it rather than
 *    reaching in here.
 *
 * `status` is a separate line above the button, never a sibling beside it.
 * "Saving…", "Saved ✓" and — the one that matters — a save error are the
 * things a user reads at the exact moment they are least willing to hunt, and
 * an error squeezed next to a full-width button truncates or shoves the
 * button off-centre. It is also an `aria-live` region, so a screen-reader user
 * hears the result of a save they cannot see.
 *
 * Rule SA-1: exactly one of these per route. The route owns the Save; child
 * components never mount their own, or two bars stack on the same 44px of
 * screen and neither one is obviously the real one.
 */

export type StickyActionProps = {
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** Rendered on its OWN line above the button — "Saved ✓", or a save error. */
  status?: React.ReactNode;
  secondary?: { label: string; onClick: () => void };
};

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950";

const BTN_BOX =
  "flex h-12 items-center justify-center rounded-xl px-5 text-base font-medium transition-colors";

/** The look of a button that is present but refusing. */
const OFF = "cursor-not-allowed opacity-50";

export function StickyAction({
  label,
  onClick,
  busy = false,
  disabled = false,
  status,
  secondary,
}: StickyActionProps): React.JSX.Element {
  const statusId = useId();

  // A busy bar is disabled too: the whole point of a pinned Save is that it is
  // always under the thumb, which also makes it always available to double-tap.
  const isDisabled = disabled || busy;

  // Refused, but never removed. The `disabled` attribute would be the obvious
  // way to say this and it is the wrong one here, for two reasons that both
  // bite the same user:
  //
  //  - `busy` is entered by the user's own tap. The instant it flips, a real
  //    `disabled` pulls the button they are standing on out of the tab order,
  //    focus falls to <body>, and the next Tab restarts at the top of a
  //    sixteen-field form — at the exact moment the live region below is
  //    announcing whether the save worked.
  //  - `disabled` is unreachable, so a Save that is off because the form is
  //    incomplete cannot be tabbed to, read, or asked about. `aria-disabled`
  //    keeps it in the page and reads as "unavailable"; the `status` line is
  //    where the reason goes — and it is wired to the button with
  //    `aria-describedby`, so "unavailable" and *why* arrive in the same
  //    breath. Left unwired, the reason only ever exists as a live-region
  //    announcement the user has already missed by the time they tab to Save.
  //
  // The click is refused here instead of by the browser, which keeps the
  // double-tap guard the pinned position invites.
  const handlePrimary = () => {
    if (isDisabled) return;
    onClick();
  };

  // Cancel survives a validation-disabled Save — it is the escape from exactly
  // that state — but not a save in flight.
  const handleSecondary = () => {
    if (busy || !secondary) return;
    secondary.onClick();
  };

  // `status` is a ReactNode, so an empty render is not just `null` — guard the
  // falsy leaves explicitly rather than leaning on truthiness (a status of `0`
  // is nonsense here, but `false` and `""` are exactly what a caller writes for
  // "nothing to say right now").
  const hasStatus =
    status !== undefined && status !== null && status !== false && status !== "";

  return (
    <div
      className="sticky z-30 -mx-4 border-t border-zinc-200 bg-white/95 px-4 pb-2 pt-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 sm:static sm:z-auto sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-1 sm:backdrop-blur-none sm:dark:bg-transparent"
      style={{
        bottom:
          "calc(env(safe-area-inset-bottom, 0px) + var(--lmiros-bottom-bar, 0px))",
      }}
    >
      {/* Always mounted, even when empty, so the live region exists before the
          text lands in it — screen readers routinely miss an announcement from
          a region that was inserted in the same tick as its content. An empty
          block has no height, so this costs nothing while there is nothing to
          say. */}
      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={
          hasStatus
            ? "mb-2 text-center text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-left"
            : ""
        }
      >
        {hasStatus ? status : null}
      </p>

      {/* Primary first in the DOM so a keyboard reaches Save before Cancel, and
          so the two orders — mobile row and desktop line — are the same order.
          `secondary` is for a benign escape (Cancel, Skip). A destructive
          control does not belong in the same row as Save and must not be
          passed here. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePrimary}
          aria-disabled={isDisabled || undefined}
          aria-busy={busy || undefined}
          aria-describedby={hasStatus ? statusId : undefined}
          className={`${BTN_BOX} ${FOCUS_RING} flex-1 bg-blue-600 text-white sm:flex-none ${
            isDisabled ? OFF : "active:bg-blue-700"
          }`}
        >
          {label}
        </button>
        {secondary && (
          <button
            type="button"
            onClick={handleSecondary}
            aria-disabled={busy || undefined}
            className={`${BTN_BOX} ${FOCUS_RING} shrink-0 border border-zinc-300 bg-transparent text-zinc-700 dark:border-zinc-700 dark:text-zinc-200 ${
              busy ? OFF : "active:bg-zinc-100 dark:active:bg-zinc-800"
            }`}
          >
            {secondary.label}
          </button>
        )}
      </div>
    </div>
  );
}
