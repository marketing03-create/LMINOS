"use client";

import { useState } from "react";
import { Sheet } from "@/components/mobile/sheet";

/**
 * The two phone-only halves of the audit page. Both live here rather than in
 * `page.tsx` because the page is a server component and has to stay one: the
 * three audit queries, the 200-row cap and the `leftJoin` on the actor email
 * are frozen, and promoting the route to `"use client"` just to get a state
 * hook would drag all 200 rows across the boundary a second time for the
 * privilege of hiding 175 of them.
 *
 * So nothing in here ever receives a row. `AuditFilters` gets the same four
 * search params the URL already carries plus the 20 event types the page has
 * already counted; `AuditShowMore` gets a number. The entries themselves are
 * rendered once, by the server, exactly as they are today.
 */

export type EventTypeCount = { type: string; n: number };

const DAY_LABEL: Record<string, string> = {
  "1": "Last 24h",
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
};

/**
 * Five stacked 36px controls plus an Apply button cost roughly 260px at 375px
 * — most of the first screen, spent on controls touched once a visit, before a
 * single audit entry appears. They collapse into one 44px chip that says what
 * is currently filtered, with the real controls one tap away.
 *
 * The controls inside the sheet are the *same* `<form method="get">`: same
 * five names, no `action`, so it submits a plain GET to this route and the
 * `q` / `event` / `entity` / `days` URL contract stays byte-identical to the
 * desktop form still sitting in `page.tsx`. Deliberately not a `router.push`
 * — the moment this becomes a JavaScript navigation it becomes a second,
 * subtly different way of building the same URL, and one of the two will drift.
 *
 * Apply is pinned in the sheet footer rather than sitting at the end of the
 * scroll, because with five controls it would otherwise fall below the fold of
 * the panel. It reaches the form by `form=` id association, which is the one
 * mechanism that lets a submit button live outside the form it submits.
 */
export function AuditFilters({
  q,
  event,
  entity,
  days,
  eventTypes,
}: {
  q: string;
  event: string;
  entity: string;
  days: string;
  eventTypes: EventTypeCount[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const summary = [
    DAY_LABEL[days] ?? `Last ${days} days`,
    event || "All events",
    entity || null,
    q ? `id contains ${q}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const formId = "audit-filters-sheet-form";

  return (
    <div className="mb-4 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-full border border-blue-500 bg-white px-4 text-sm font-medium text-zinc-900 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-zinc-950 dark:text-zinc-100 dark:active:bg-zinc-800"
      >
        {/* Truncated in the pill only. The whole string is in the DOM for a
            screen reader, and it is repeated, wrapping, at the top of the
            sheet — so nothing is actually lost to the ellipsis. */}
        <span className="truncate">{summary}</span>
        <span className="sr-only">Change filters</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-blue-500"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filters"
        footer={
          <button
            type="submit"
            form={formId}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-base font-medium text-white active:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Apply filters
          </button>
        }
      >
        <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {summary}
        </p>

        <form id={formId} method="get" className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
              Entity id contains
            </span>
            {/* 16px on the phone is not a taste call: iOS Safari zooms the
                viewport on focus for any field under 16px, and this is the one
                field on the page you type into. */}
            <input
              name="q"
              defaultValue={q}
              className="h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base sm:text-sm dark:border-zinc-800 dark:bg-zinc-950"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
              Event
            </span>
            <select
              name="event"
              defaultValue={event}
              className="h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base sm:text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="">All events</option>
              {eventTypes.map((e) => (
                <option key={e.type} value={e.type}>
                  {e.type} ({e.n})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
              Entity
            </span>
            <select
              name="entity"
              defaultValue={entity}
              className="h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base sm:text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="">All entities</option>
              <option value="lead">lead</option>
              <option value="sales_record">sales_record</option>
              <option value="rejected_lead">rejected_lead</option>
              <option value="user">user</option>
              <option value="ad_spend_batch">ad_spend_batch</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
              Period
            </span>
            <select
              name="days"
              defaultValue={days}
              className="h-12 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base sm:text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <option value="1">Last 24h</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
        </form>
      </Sheet>
    </div>
  );
}

/**
 * Paging over rows the server has already sent, and nothing else.
 *
 * The obvious build — hand the 200 rows to a client component and `slice()`
 * them — would ship every audit payload twice, once as HTML and once as props.
 * So the rows stay exactly where they are and this component writes one media
 * query that hides the `<li>`s past `shown`. Scoping that rule to
 * `max-width: 1023.98px` is what keeps the desktop list at its full 200 entries
 * with no JavaScript involved at all (P5): widen the window and every row is
 * already in the DOM, unhidden, in source order.
 *
 * A `<style>` string rather than a class per row for the same reason — tagging
 * individual rows would mean cloning server-rendered elements on the client,
 * and this is one line of CSS.
 */
export function AuditShowMore({
  total,
  listId,
  initial = 25,
  step = 25,
}: {
  total: number;
  listId: string;
  initial?: number;
  step?: number;
}): React.JSX.Element | null {
  const [shown, setShown] = useState(initial);

  if (total <= initial) return null;

  const remaining = Math.max(0, total - shown);

  return (
    <>
      {shown < total && (
        <style>{`@media (max-width: 1023.98px) { #${listId} > li:nth-child(n + ${
          shown + 1
        }) { display: none; } }`}</style>
      )}
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setShown((n) => n + step)}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-zinc-200 text-base font-medium text-zinc-700 active:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 lg:hidden dark:border-zinc-800 dark:text-zinc-200 dark:active:bg-zinc-900"
        >
          Show {Math.min(step, remaining)} more
        </button>
      )}
    </>
  );
}
