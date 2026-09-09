"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AUTO_COLUMNS, MANUAL_COLUMNS } from "@/lib/tiktok-live/screenshot-extract-core";
import { ProductPicker } from "@/components/product-picker";
import { LivePicker } from "@/components/live-picker";
import { Sheet } from "@/components/mobile/sheet";
import { Disclosure } from "@/components/mobile/disclosure";
import { NumberField } from "@/components/mobile/number-field";
import { StickyAction } from "@/components/mobile/sticky-action";
import { HelpChip } from "@/components/mobile/metric-help-sheet";
import type { MatchCandidate } from "@/lib/tiktok-live/queries";

const sameProducts = (a: string[], b: string[]) =>
  [...a].sort().join("|") === [...b].sort().join("|");

// The lead counts get their own prominent "Your results" section at the top, so
// exclude them from the general extras grid (apply() still reads them from the
// same values map, so nothing changes in what gets saved).
const EXTRA_COLUMNS = MANUAL_COLUMNS.filter(
  (c) => c !== "totalLeads" && c !== "filteredLeads"
);

const LABELS: Record<string, string> = {
  totalViews: "Views",
  peakViewers: "Peak viewers",
  avgViewers: "Avg viewers",
  totalLikes: "Likes",
  totalComments: "Comments",
  totalShares: "Shares",
  newFollowers: "New followers",
  uniqueViewers: "Unique viewers",
  activeViewers: "Active viewers",
  avgWatchSeconds: "Avg watch (sec)",
  directMessages: "Direct messages",
  serviceBioViews: "Service bio views",
  interestedViewers: "Interested viewers",
  diamonds: "Diamonds",
  totalLeads: "Total Leads",
  filteredLeads: "Filtered Leads",
};

/**
 * `8 Sep, 9:15 pm` — short enough to sit on one line of a 375px chip beside a
 * 44px button, which the full `en-MY` timestamp (`08/09/2026, 21:15:00`) is
 * not. No `timeZone` option on purpose: every other date on this route is
 * formatted in the reader's own zone (see `LivePicker`), and quietly pinning
 * one of them to MYT would make the same live look like two different lives
 * depending on which control you read it from.
 */
function fmtWhen(d: Date | string | null): string {
  if (!d) return "Date unknown";
  return new Date(d).toLocaleString("en-MY", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Everything the form pre-fills from a live, in one place — it is read twice
 *  (once for the F4 default at mount, once on every re-pick) and the two must
 *  not drift. */
function stateFor(s: MatchCandidate | null) {
  const values: Record<string, string> = {};
  if (s) {
    for (const col of [...AUTO_COLUMNS, ...MANUAL_COLUMNS]) {
      const cur = s.current[col];
      values[col] = cur == null ? "" : String(cur);
    }
  }
  return {
    sessionId: s?.sessionId ?? "",
    products: s?.products ?? [],
    remarks: s?.remarks ?? "",
    values,
  };
}

/**
 * Type-the-numbers form on the streamer upload page. This is the MAIN way to
 * record a live's TikTok-backend numbers — the screenshot reader is just a
 * shortcut. The live is already picked, you type what TikTok Studio shows, tag
 * the product, and save. Writes through the same routes the screenshot import
 * uses (product via the session PATCH, numbers via apply-screenshot), so the
 * Views/Likes lock and audit trail are identical.
 */
export function ManualEntryForm({
  sessions,
  autoSelect = false,
}: {
  sessions: MatchCandidate[];
  /**
   * Fix F4, and deliberately opt-in rather than always-on. `?mode=manual` is
   * the route the tab bar's "+" points at, and there the streamer has exactly
   * one job — clear the live that just ended — so guessing it for them is a
   * free tap. The legacy no-mode page is a union of three forms where a
   * pre-filled one would look like it had already been touched, so it opts out
   * and keeps rendering the untouched picker it renders today.
   */
  autoSelect?: boolean;
}) {
  const router = useRouter();

  // The newest live still missing its Total Leads is, by definition, the one
  // the streamer came here to fill in — Home computes the same set to build its
  // "needs numbers" list. `sessionsForMatching` returns newest first, so the
  // first match is the newest one. Falling back to the newest live overall
  // matters more than it looks: with every live already filled in, an empty
  // picker would read as "nothing to correct here".
  const initial = useMemo(
    () =>
      stateFor(
        autoSelect
          ? sessions.find((s) => s.current.totalLeads == null) ?? sessions[0] ?? null
          : null
      ),
    [sessions, autoSelect]
  );

  const [sessionId, setSessionId] = useState(initial.sessionId);
  const [products, setProducts] = useState<string[]>(initial.products);
  const [values, setValues] = useState<Record<string, string>>(initial.values);
  const [remarks, setRemarks] = useState(initial.remarks);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Seconds left on the frozen post-save redirect. `null` = no redirect pending
  // (either none started, or the streamer cancelled it).
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = sessions.find((s) => s.sessionId === sessionId);

  // Both halves of the redirect live here so "Stay here" and unmount can stop
  // them together. A ref, not state: cancelling must not wait for a re-render —
  // the whole control exists to beat a 2s timer.
  const timers = useRef<{
    push: ReturnType<typeof setTimeout> | null;
    tick: ReturnType<typeof setInterval> | null;
  }>({ push: null, tick: null });

  const stopRedirect = useCallback(() => {
    if (timers.current.push) clearTimeout(timers.current.push);
    if (timers.current.tick) clearInterval(timers.current.tick);
    timers.current = { push: null, tick: null };
  }, []);

  // A pending `router.push` that fires after this form is gone would yank a
  // streamer off whatever they navigated to instead.
  useEffect(() => stopRedirect, [stopRedirect]);

  function pickSession(id: string) {
    const next = stateFor(sessions.find((x) => x.sessionId === id) ?? null);
    setSessionId(id);
    setApplied(false);
    setMsg(null);
    setProducts(next.products);
    setRemarks(next.remarks);
    setValues(next.values);
    setPickerOpen(false);
    setQuery("");
  }

  function setVal(col: string, raw: string) {
    setValues((prev) => ({ ...prev, [col]: raw }));
    setApplied(false);
    setMsg(null);
  }

  function stayHere() {
    stopRedirect();
    setCountdown(null);
    // `applied` has to come back off, not just the timers. Every control on
    // this form — the fields, the product picker, the remarks box, the "Change"
    // button and the desktop LivePicker — is disabled on `busy || applied`,
    // because until now `applied` only ever lasted the 2s until the redirect
    // took the form off screen. Leaving it latched here would strand the
    // streamer on a form where nothing responds, which is the opposite of what
    // "Stay here" promises (and it exists precisely for the streamer with three
    // lives to clear in one sitting, who now needs to pick the next one).
    setApplied(false);
    setMsg("Saved ✓");
    // The redirect path refreshes; the stay path must too, or the "Now …" chips
    // beside every field keep showing the pre-save values and a second Save
    // would diff against stale `current` and re-send numbers that are already
    // stored — one extra audit row per save. Contract #66: router.refresh()
    // after every successful mutation.
    router.refresh();
  }

  async function apply() {
    if (!sessionId || !selected) {
      setMsg("Pick a live first.");
      return;
    }
    // Only send fields that actually changed (AUTO can't be blank → skip blanks;
    // MANUAL may be cleared to null).
    const payload: Record<string, number | null> = {};
    for (const col of AUTO_COLUMNS) {
      const raw = (values[col] ?? "").trim();
      if (raw === "") continue;
      const n = Math.max(0, Math.round(Number(raw) || 0));
      const cur = selected.current[col];
      if (cur != null && Number(cur) === n) continue;
      payload[col] = n;
    }
    for (const col of MANUAL_COLUMNS) {
      const raw = (values[col] ?? "").trim();
      const next = raw === "" ? null : Math.max(0, Math.round(Number(raw) || 0));
      const cur = selected.current[col] ?? null;
      if ((cur == null ? null : Number(cur)) === next) continue;
      payload[col] = next;
    }
    const productChanged = !sameProducts(products, selected.products ?? []);
    const remarksChanged = remarks.trim() !== (selected.remarks ?? "").trim();
    const hasNumbers = Object.keys(payload).length > 0;
    if (!hasNumbers && !productChanged && !remarksChanged) {
      setMsg("Nothing changed to save.");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      // Product tag + remarks (session PATCH — saves even when no number changed).
      if (productChanged || remarksChanged) {
        const patchBody: Record<string, unknown> = {};
        if (productChanged) patchBody.products = products;
        if (remarksChanged) patchBody.remarks = remarks.trim() === "" ? null : remarks.trim();
        const pRes = await fetch(`/api/tiktok-live/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        const pj = await pRes.json().catch(() => ({}));
        if (!pRes.ok || pj.ok === false) {
          setMsg(pj.error ?? `Save failed (${pRes.status}).`);
          setBusy(false);
          return;
        }
      }
      // The numbers.
      if (hasNumbers) {
        const res = await fetch(
          `/api/tiktok-live/sessions/${sessionId}/apply-screenshot`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ values: payload }),
          }
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.ok === false) {
          setMsg(j.error ?? `Failed (${res.status}).`);
          setBusy(false);
          return;
        }
      }
      setApplied(true);
      setMsg(null);
      // Not cosmetic: `StickyAction` refuses its secondary button while `busy`,
      // and the secondary button here is "Stay here". Leaving `busy` latched on
      // after a successful save — which is what this form used to do, harmlessly,
      // when the only thing left to happen was a redirect — would make the one
      // control that stops that redirect silently do nothing.
      setBusy(false);
      // Green for a beat, then jump to this live's row on the list page and
      // refetch it, so the just-saved numbers show instead of a cached feed.
      //
      // The 2s push is the frozen default path and stays exactly as it was.
      // What is new is that it is now *visible* and *refusable*: the countdown
      // says a navigation is coming, and "Stay here" clears it. That matters
      // for the streamer with three lives to clear in one sitting, who today
      // gets thrown to the feed after each one.
      setCountdown(2);
      timers.current.tick = setInterval(() => {
        setCountdown((c) => (c == null ? c : Math.max(0, c - 1)));
      }, 1000);
      timers.current.push = setTimeout(() => {
        router.push(`/tiktok-live#session-${sessionId}`);
        router.refresh();
      }, 2000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const matches = q
    ? sessions.filter((s) =>
        `${fmtWhen(s.startedAt)} @${s.handle} ${s.title ?? ""}`
          .toLowerCase()
          .includes(q)
      )
    : sessions;

  const redirecting = applied && countdown != null;

  if (sessions.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-zinc-500">No lives captured yet.</p>
        {/* Never a terminal dead end (F1): the one thing a streamer with no
            captured lives can actually do is add the one the tracker missed,
            and it is on this page — just further down. */}
        <a
          href="#add-past-live"
          className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-300 px-4 text-base font-medium text-zinc-700 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800"
        >
          Add a live that&apos;s missing →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Step 1 — which live. Pre-picked (F4), so the everyday path is "glance
          and carry on" rather than "open a list of sixty and find yesterday".

          Two controls for one job, because the two widths want opposite things.
          Below `lg` the identity is a locked chip and changing it is a separate
          44px button, so the thing you usually only need to *read* is not also
          the thing you can knock open with a thumb. At `lg` the dropdown is the
          control this form has always had, unchanged. */}
      <div className="lg:hidden">
        <div className="mb-1 text-xs font-medium text-zinc-500">Which live</div>
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              {selected ? fmtWhen(selected.startedAt) : "Pick a live"}
            </div>
            {selected && (
              <div className="text-xs text-zinc-500">@{selected.handle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={busy || applied}
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800"
          >
            Change
          </button>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="text-xs font-medium mb-1">Which live</div>
        <LivePicker
          lives={sessions}
          value={sessionId}
          onChange={pickSession}
          disabled={busy || applied}
        />
      </div>

      {/* The picker sheet is written out here rather than borrowed from
          `LivePicker` for one reason: `LivePicker` owns its own trigger and its
          own open state, so a separate "Change" button could only ever *reveal*
          it — costing a second tap on the exact interaction F4 exists to make
          cheaper. The desktop dropdown above is still the real `LivePicker`, so
          there is no second implementation at the width that has one. */}
      <Sheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Which live"
      >
        {sessions.length > 6 && (
          // Pinned, not scrolled away: on a 667px screen the keyboard takes
          // roughly half the sheet, and a search box that scrolls with its own
          // results is a box you cannot see while typing into it.
          <div className="sticky top-0 z-10 -mx-4 border-b border-zinc-200 bg-white px-4 pb-2 pt-1 dark:border-zinc-800 dark:bg-zinc-950">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search date or handle…"
              aria-label="Search lives"
              className="h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
        )}
        <ul className="py-1">
          {matches.length === 0 && (
            <li className="px-1 py-6 text-center text-sm text-zinc-500">
              No matching lives.
            </li>
          )}
          {matches.map((s) => {
            const on = s.sessionId === sessionId;
            return (
              <li key={s.sessionId}>
                <button
                  type="button"
                  onClick={() => pickSession(s.sessionId)}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                    on
                      ? "bg-blue-50 dark:bg-blue-950/40"
                      : "active:bg-zinc-50 dark:active:bg-zinc-900"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="w-4 shrink-0 text-blue-600 dark:text-blue-400"
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium tabular-nums">
                      {fmtWhen(s.startedAt)}
                      {on && <span className="sr-only"> (selected)</span>}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      @{s.handle}
                      {s.title ? ` · ${s.title}` : ""}
                    </span>
                  </span>
                  {s.current.totalLeads == null && (
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                      Needs numbers
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>

      {selected && (
        <>
          {/* Your results — the goal numbers, first and prominent. */}
          <div className={SECTION}>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Your results
              </div>
              <HelpChip keys={["totalLeads", "filteredLeads"]} />
            </div>
            {/* One column on a phone: two 48px boxes side by side at 375px
                leaves each `Now 1,234` chip wrapping to three lines under a
                145px input. Two columns from `sm` up is what this grid has
                always been. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
              <NumberField
                col="totalLeads"
                label="Total Leads"
                value={values.totalLeads ?? ""}
                current={selected.current.totalLeads}
                onChange={setVal}
                disabled={busy || applied}
              />
              <NumberField
                col="filteredLeads"
                label="Filtered Leads"
                value={values.filteredLeads ?? ""}
                current={selected.current.filteredLeads}
                onChange={setVal}
                disabled={busy || applied}
              />
            </div>
          </div>

          {/* Products. */}
          <div className={SECTION}>
            <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Product / service
            </div>
            <ProductPicker
              value={products}
              onChange={(next) => {
                setProducts(next);
                setApplied(false);
                setMsg(null);
              }}
              disabled={busy || applied}
            />
          </div>

          {/* The seven TikTok-backend fields the streamer reads off TikTok
              Studio. One name for this group everywhere in the app. */}
          <Disclosure title="TikTok backend" count="7 numbers" headingLevel={2}>
            <FieldGrid
              cols={EXTRA_COLUMNS}
              values={values}
              current={selected.current}
              disabled={busy || applied}
              onChange={setVal}
            />
          </Disclosure>

          {/* Remarks — free-text notes about this specific live. */}
          <div className={SECTION}>
            <label className="mb-2 block text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Remarks
            </label>
            <textarea
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value);
                setApplied(false);
                setMsg(null);
              }}
              disabled={busy || applied}
              rows={3}
              placeholder="Add any notes about this live — issues, highlights, follow-ups…"
              className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base leading-relaxed text-zinc-900 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          {/* Auto-captured — the bot fills these; collapsed unless a fix is
              needed, and forced open at `lg` by the Disclosure CSS rule. */}
          <Disclosure title="Auto-captured" count="7 numbers" headingLevel={2}>
            <FieldGrid
              cols={AUTO_COLUMNS}
              values={values}
              current={selected.current}
              disabled={busy || applied}
              onChange={setVal}
            />
          </Disclosure>

          <StickyAction
            label={applied ? "Saved ✓" : busy ? "Saving…" : "Save results"}
            onClick={apply}
            busy={busy}
            disabled={applied}
            status={
              redirecting
                ? `Saved ✓ — opening your live… (${countdown})`
                : msg
            }
            secondary={
              redirecting ? { label: "Stay here", onClick: stayHere } : undefined
            }
          />
        </>
      )}
    </div>
  );
}

function FieldGrid({
  cols,
  values,
  current,
  disabled,
  onChange,
}: {
  cols: readonly string[];
  values: Record<string, string>;
  current: Record<string, number | null>;
  disabled: boolean;
  onChange: (col: string, v: string) => void;
}) {
  return (
    // One column on a phone, then straight back to the two- and four-column
    // grids this form renders today from `sm` and `md` up. Below `sm` the old
    // `grid-cols-2` put a 48px input and its "Now 1,234 → 1,340" chip into
    // ~160px, which is where that chip was getting clipped.
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3 md:grid-cols-4">
      {cols.map((c) => (
        <NumberField
          key={c}
          col={c}
          label={LABELS[c] ?? c}
          value={values[c] ?? ""}
          current={current[c]}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

// Each block sits in its own ELEVATED card — a solid surface a shade lighter
// than the page (white on light, zinc-900 on dark) with a soft shadow, so the
// sections clearly stand out as distinct steps (per the reference layout).
const SECTION =
  "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
