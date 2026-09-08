"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/mobile/sheet";
import { NumberField } from "@/components/mobile/number-field";
import { StickyAction } from "@/components/mobile/sticky-action";
import { HelpChip } from "@/components/mobile/metric-help-sheet";

/**
 * The two-number shortcut for the one job a streamer opens this app to do.
 *
 * Leads sit on roughly a fifth of lives, and the reason is a routing problem
 * rather than a willingness problem: today the only way to key Total/Filtered
 * leads is to leave Home, load `/tiktok-live/[id]`, scroll past fifteen
 * connector-captured numbers they have no reason to touch, and find the two at
 * the bottom. That is a lot of ceremony for two integers, and it is why an
 * amber "Add results" nudge sits on so many cards for so long.
 *
 * So the nudge becomes the control. The chip in a Home card's `action` slot
 * opens a sheet with exactly the two fields, and the streamer never leaves the
 * feed. The card underneath still navigates to the session page for everything
 * else — this deliberately does not become the place you edit a live.
 *
 * Two decisions worth writing down:
 *
 *  - It PATCHes `/api/tiktok-live/sessions/[id]` with only the keys that
 *    actually changed. Same route, same body shape, same
 *    `tiktok_live_session.manual_metrics` audit write the session page already
 *    uses — no second write path to keep in sync. It never goes near
 *    `apply-screenshot`, which is what makes it structurally incapable of
 *    raising a spurious `screenshot_mismatch` alert against a streamer who
 *    simply typed a number.
 *  - Blank is sent as `null`, never as `0`. The whole point of the amber chip
 *    is that "nobody has entered this yet" and "nobody contacted me" are
 *    different facts about a named person's week, and only one of them is a
 *    verdict.
 *
 * The sheet holds its own open state and renders its own trigger, because the
 * trigger and the sheet are one affordance — a caller that had to wire
 * `open`/`onClose` per card would be holding state for sixty cards to run one.
 *
 * And two about where it is allowed to exist at all:
 *
 *  - The chip is `lg:hidden`. This is a shortcut around a scroll, and a desktop
 *    streamer does not have the scroll: the session page is one click away in a
 *    window that shows the whole card. P5 says the ≥1024px DOM matches what was
 *    there before, so an extra control on the desktop Home card would be a
 *    regression wearing a feature's clothes. The `matchMedia` effect closes an
 *    open sheet at the same breakpoint the trigger vanishes at — otherwise an
 *    iPad rotated into landscape (exactly 1024px) is left holding a bottom
 *    sheet whose trigger no longer exists to restore focus to.
 *  - `HelpChip` opens a second `Sheet` on top of this one, and both of them
 *    listen for Escape on `document`. Ours was registered first, so one Escape
 *    would close both — and the body scroll lock would never come back off,
 *    because React tears the outer sheet's effect down before the inner one's
 *    and the inner restore then writes `overflow: hidden` back onto a page with
 *    no sheet left on it. `stackedAbove()` is the cheap way to say "that key
 *    was not meant for me".
 */

export type LeadsQuickSheetProps = {
  sessionId: string;
  /** "8 Sep, 9:15 pm" — a feed has many cards; the sheet must say which live. */
  when: string;
  totalLeads: number | null;
  filteredLeads: number | null;
  /** Caller refreshes its own data (router.refresh()). */
  onSaved?: () => void;
};

type Parsed = { ok: true; value: number | null } | { ok: false };

/**
 * Callers own their clamping (contract 14) and `NumberField` reports the raw
 * string, so the rounding happens here. A non-empty value that is not a number
 * is an error, not a null — silently clearing a number the streamer mistyped
 * would be the worst possible outcome of a save button.
 */
function parse(raw: string): Parsed {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: Math.max(0, Math.round(n)) };
}

/**
 * The route answers a *validation* failure in JSON but an *auth* failure in
 * plain text — `requireRole` returns a bare `new NextResponse(auth.error)` — so
 * `res.json()` on its own throws exactly when the message matters most and the
 * streamer is told "Not saved (403)" instead of "forbidden — not your live".
 * Read the body once as text, then decide what it was.
 */
function parseJson(raw: string): { ok?: boolean; error?: string } | null {
  try {
    const v: unknown = JSON.parse(raw);
    return typeof v === "object" && v !== null
      ? (v as { ok?: boolean; error?: string })
      : null;
  } catch {
    return null;
  }
}

/**
 * A framework 500 answers in HTML, and a stack-trace page pasted into a sheet
 * helps nobody. Only a short, plain sentence from the server is shown as-is.
 */
function errorFrom(
  json: { error?: string } | null,
  raw: string,
  status: number
): string {
  if (json?.error) return json.error;
  const text = raw.trim();
  if (text && text.length <= 200 && !text.startsWith("<")) return text;
  return `Not saved (${status}). Try again.`;
}

/**
 * Is another modal sitting on top of ours? `Sheet` is contractually
 * `role="dialog" aria-modal="true"` (§4.1), so counting those nodes is a stable
 * question to ask, and it is asked only from an event handler — never during
 * render, where `document` does not exist on the server.
 */
function stackedAbove(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelectorAll('[role="dialog"][aria-modal="true"]').length > 1;
}

export function LeadsQuickSheet({
  sessionId,
  when,
  totalLeads,
  filteredLeads,
  onSaved,
}: LeadsQuickSheetProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState("");
  const [filtered, setFiltered] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsResults = totalLeads == null;

  // Subscribe only — no synchronous "are we at lg already?" read. The trigger is
  // `display:none` at `lg`, so `open` can only ever be set from below the
  // breakpoint; the initial check would be dead code and an SSR hazard besides.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open]);

  // Seed on open rather than in an effect, so re-opening after a refresh always
  // shows what is actually saved and never a stale draft.
  function openSheet() {
    setTotal(totalLeads == null ? "" : String(totalLeads));
    setFiltered(filteredLeads == null ? "" : String(filteredLeads));
    setError(null);
    setBusy(false);
    setOpen(true);
  }

  function onChange(col: string, v: string) {
    if (col === "totalLeads") setTotal(v);
    else setFiltered(v);
    if (error) setError(null);
  }

  async function save() {
    const t = parse(total);
    const f = parse(filtered);
    if (!t.ok || !f.ok) {
      setError("Use a whole number, or leave it blank.");
      return;
    }

    // Only the changed keys. Unchanged keys are absent from the body, so the
    // route leaves those columns alone and the audit row records the edit.
    const body: Record<string, number | null> = {};
    if (t.value !== totalLeads) body.totalLeads = t.value;
    if (f.value !== filteredLeads) body.filteredLeads = f.value;
    if (Object.keys(body).length === 0) {
      setOpen(false);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tiktok-live/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await res.text().catch(() => "");
      const json = parseJson(raw);
      if (!res.ok || json?.ok === false) {
        setError(errorFrom(json, raw, res.status));
        return;
      }
      setOpen(false);
      onSaved?.();
    } catch {
      setError("Not saved — you look offline. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const parsedTotal = parse(total);
  const parsedFiltered = parse(filtered);
  const overFiltered =
    parsedTotal.ok &&
    parsedFiltered.ok &&
    parsedTotal.value != null &&
    parsedFiltered.value != null &&
    parsedFiltered.value > parsedTotal.value;

  const chipLabel = needsResults ? "Add results" : "Edit results";
  const chipTone = needsResults
    ? "border-amber-300 bg-amber-50 text-amber-800 active:bg-amber-100 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300 dark:active:bg-amber-900/40"
    : "border-zinc-300 bg-white text-zinc-600 active:bg-zinc-100 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-400 dark:active:bg-zinc-800";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Belt and braces: this chip is rendered outside the card <Link>, but
          // a future caller who nests it should still get the sheet rather than
          // a navigation.
          e.preventDefault();
          e.stopPropagation();
          openSheet();
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${chipLabel} for the live on ${when}`}
        className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 lg:hidden ${chipTone}`}
      >
        {chipLabel}
      </button>

      <Sheet
        open={open}
        onClose={() => {
          // Closing mid-save would hide the only place the failure is reported,
          // and the streamer would walk away believing the numbers landed.
          if (busy) return;
          // The Escape that reached us may have been aimed at the HelpChip's
          // sheet stacked on top of this one; see the note at the top of the
          // file for why answering it here locks the page's scroll for good.
          if (stackedAbove()) return;
          setOpen(false);
        }}
        title={`Leads · ${when}`}
        footer={
          <StickyAction
            label="Save"
            onClick={save}
            busy={busy}
            status={
              error ? (
                <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
              ) : busy ? (
                // The sheet refuses to close while the PATCH is in flight, so
                // it owes the streamer a reason. It is also the only thing a
                // screen reader has to announce between tap and outcome.
                "Saving…"
              ) : null
            }
          />
        }
      >
        <div className="space-y-3 py-1">
          <NumberField
            col="totalLeads"
            label="Total leads"
            value={total}
            current={totalLeads}
            onChange={onChange}
            disabled={busy}
            autoFocus
          />
          <NumberField
            col="filteredLeads"
            label="Filtered leads"
            value={filtered}
            current={filteredLeads}
            onChange={onChange}
            disabled={busy}
          />

          {/* Mounted even when it has nothing to say: a live region that appears
              at the same instant as its text is routinely missed, and this line
              is the only warning a screen-reader user gets about two numbers
              that contradict each other. `empty:mt-0` keeps it costing nothing
              in the `space-y-3` flow while it is silent. */}
          <p
            role="status"
            aria-live="polite"
            className="text-sm leading-relaxed text-amber-700 empty:mt-0 dark:text-amber-400"
          >
            {overFiltered
              ? "Filtered is higher than Total — filtered leads are a subset."
              : null}
          </p>

          <div className="pt-1">
            <HelpChip keys={["totalLeads", "filteredLeads"]} />
          </div>
        </div>
      </Sheet>
    </>
  );
}
