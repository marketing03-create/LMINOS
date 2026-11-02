"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshEverywhere } from "@/app/actions/refresh-everywhere";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AUTO_COLUMNS, MANUAL_COLUMNS } from "@/lib/tiktok-live/screenshot-extract-core";
import {
  AUTO_FIELDS,
  FIELD_LABEL,
  REQUIRED_FIELDS,
  STUDIO_FIELDS,
  filledCount,
  missingRequired,
} from "@/lib/tiktok-live/input-fields";
import { ProductPicker } from "@/components/product-picker";
import { Sheet } from "@/components/mobile/sheet";
import { NumberField } from "@/components/mobile/number-field";
import { StickyAction } from "@/components/mobile/sticky-action";
import { HelpChip } from "@/components/mobile/metric-help-sheet";
import { FormSection } from "@/components/mobile/form-section";
import { MonthCalendar, dayKey } from "@/components/mobile/month-calendar";
import type { MatchCandidate } from "@/lib/tiktok-live/queries";

const sameProducts = (a: string[], b: string[]) =>
  [...a].sort().join("|") === [...b].sort().join("|");

/**
 * `8 Sep, 9:15 pm`. No `timeZone` option on purpose: every other date on this
 * route is formatted in the reader's own zone, and pinning one of them to MYT
 * would make the same live look like two different lives.
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

/** Everything the form pre-fills from a live — read at mount and on every re-pick. */
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
 * Type in a live's results. The live comes first (pre-picked: the newest one
 * still owing a required number), then the form in numbered sections —
 * 1 Required (what reminders chase), 2 TikTok Studio, 3 Live performance (the
 * connector's numbers, folded away), 4 Product & remarks — each with a "filled /
 * total" pill. The Save bar counts the changes it is about to send.
 *
 * Writes exactly as before: product + remarks through the session PATCH, the
 * numbers through apply-screenshot, changed keys only, so the audit trail and
 * the Views/Likes lock are the same as a screenshot import.
 */
export function ManualEntryForm({
  sessions,
  autoSelect = false,
}: {
  sessions: MatchCandidate[];
  /** Pre-pick the newest live still owing numbers (the "+" button's route). */
  autoSelect?: boolean;
}) {
  const router = useRouter();

  // `sessionsForMatching` returns newest first, so the first match is the
  // newest live still owing a required number. Falling back to the newest live
  // overall keeps the form usable when everything is already filled in.
  const initial = useMemo(
    () =>
      stateFor(
        autoSelect
          ? sessions.find((s) => missingRequired(s.current) > 0) ?? sessions[0] ?? null
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
  // Seconds left on the post-save redirect; null = none pending.
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = sessions.find((s) => s.sessionId === sessionId);

  // The calendar: lives grouped by Malaysia-time day (see `dayKey`), and each
  // day's dot — amber while any live that day
  // still owes a required number, green once they all are in.
  const byDay = useMemo(() => {
    const map = new Map<string, MatchCandidate[]>();
    for (const s of sessions) {
      if (!s.startedAt) continue;
      const k = dayKey(new Date(s.startedAt));
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    // Earliest first within a day, so the list reads like the day went.
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.startedAt!).getTime() - new Date(b.startedAt!).getTime());
    }
    return map;
  }, [sessions]);
  const marks = useMemo(() => {
    const out: Record<string, "owed" | "done"> = {};
    for (const [k, list] of byDay) {
      out[k] = list.some((s) => missingRequired(s.current) > 0) ? "owed" : "done";
    }
    return out;
  }, [byDay]);
  const [day, setDay] = useState(() => {
    const first = sessions.find((s) => s.sessionId === initial.sessionId);
    return first?.startedAt ? dayKey(new Date(first.startedAt)) : dayKey(new Date());
  });
  const [calOpen, setCalOpen] = useState(false);
  const dayLives = byDay.get(day) ?? [];

  // Both halves of the redirect live here so "Stay here" and unmount can stop
  // them together. A ref: cancelling must not wait for a re-render.
  const timers = useRef<{
    push: ReturnType<typeof setTimeout> | null;
    tick: ReturnType<typeof setInterval> | null;
  }>({ push: null, tick: null });

  const stopRedirect = useCallback(() => {
    if (timers.current.push) clearTimeout(timers.current.push);
    if (timers.current.tick) clearInterval(timers.current.tick);
    timers.current = { push: null, tick: null };
  }, []);

  useEffect(() => stopRedirect, [stopRedirect]);

  function pickSession(id: string) {
    const live = sessions.find((x) => x.sessionId === id) ?? null;
    const next = stateFor(live);
    if (live?.startedAt) setDay(dayKey(new Date(live.startedAt)));
    setSessionId(id);
    setApplied(false);
    setMsg(null);
    setProducts(next.products);
    setRemarks(next.remarks);
    setValues(next.values);
    setPickerOpen(false);
    setQuery("");
  }

  // Picking a day selects its live straight away (the first one still owing
  // numbers, else the first); a day with several shows them all to choose
  // from, and a day with none clears the form.
  function pickDay(key: string) {
    setDay(key);
    setCalOpen(false);
    const list = byDay.get(key) ?? [];
    const target = list.find((s) => missingRequired(s.current) > 0) ?? list[0];
    if (target) pickSession(target.sessionId);
    else {
      setSessionId("");
      setValues({});
      setProducts([]);
      setRemarks("");
      setApplied(false);
      setMsg(null);
    }
  }

  function setVal(col: string, raw: string) {
    setValues((prev) => ({ ...prev, [col]: raw }));
    setApplied(false);
    setMsg(null);
  }

  function stayHere() {
    stopRedirect();
    setCountdown(null);
    // `applied` disables every control, so it has to come off too, or "Stay
    // here" would strand the streamer on a form where nothing responds.
    setApplied(false);
    setMsg("Saved ✓");
    // Refresh every cached page, or the "Now …" chips keep pre-save values and
    // the next Save diffs against stale numbers.
    void refreshEverywhere();
  }

  // What a Save would send right now: changed numbers only (AUTO columns can't
  // be blank, so a blank is skipped; MANUAL ones may be cleared to null).
  const changes = useMemo(() => {
    const payload: Record<string, number | null> = {};
    if (!selected) return { payload, productChanged: false, remarksChanged: false, count: 0 };
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
    const count =
      Object.keys(payload).length + (productChanged ? 1 : 0) + (remarksChanged ? 1 : 0);
    return { payload, productChanged, remarksChanged, count };
  }, [selected, values, products, remarks]);

  async function apply() {
    if (!sessionId || !selected) {
      setMsg("Pick a live first.");
      return;
    }
    const { payload, productChanged, remarksChanged } = changes;
    const hasNumbers = Object.keys(payload).length > 0;
    if (changes.count === 0) {
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
      if (hasNumbers) {
        const res = await fetch(`/api/tiktok-live/sessions/${sessionId}/apply-screenshot`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ values: payload }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.ok === false) {
          setMsg(j.error ?? `Failed (${res.status}).`);
          setBusy(false);
          return;
        }
      }
      setApplied(true);
      setMsg(null);
      // `busy` off now: StickyAction ignores its secondary ("Stay here") while busy.
      setBusy(false);
      // A visible, refusable 2s hop to this live's row on the list page.
      setCountdown(2);
      timers.current.tick = setInterval(() => {
        setCountdown((c) => (c == null ? c : Math.max(0, c - 1)));
      }, 1000);
      timers.current.push = setTimeout(() => {
        void refreshEverywhere().finally(() =>
          router.push(`/tiktok-live#session-${sessionId}`)
        );
      }, 2000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const matches = q
    ? sessions.filter((s) =>
        `${fmtWhen(s.startedAt)} @${s.handle} ${s.title ?? ""}`.toLowerCase().includes(q)
      )
    : sessions;

  const redirecting = applied && countdown != null;
  const locked = busy || applied;

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center dark:border-zinc-700">
        <p className="text-[15px] font-medium text-zinc-700 dark:text-zinc-200">No lives captured yet</p>
        <Link
          href="/tiktok-live/import?mode=missing"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-medium text-zinc-700 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800"
        >
          Add a missing live
        </Link>
      </div>
    );
  }

  const missing = selected ? missingRequired(selected.current) : 0;
  const saveLabel = applied
    ? "Saved ✓"
    : busy
      ? "Saving…"
      : changes.count > 0
        ? `Save ${changes.count} change${changes.count === 1 ? "" : "s"}`
        : "No changes";

  return (
    <div className="space-y-4">
      {/* Which live: a date (with a month calendar whose dots show which days
          still owe numbers), then that day's lives to choose from. */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Live date</span>
          {selected && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                missing === 0
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
              }`}
            >
              {missing === 0 ? "Complete" : `${missing} required missing`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCalOpen((o) => !o)}
            disabled={locked}
            aria-expanded={calOpen}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl border border-zinc-300 bg-white px-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 active:bg-zinc-50 disabled:opacity-50 lg:min-h-10 lg:hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:active:bg-zinc-900 lg:dark:hover:bg-zinc-900"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-blue-600 dark:text-blue-400">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
              {new Date(`${day}T00:00:00`).toLocaleDateString("en-MY", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-zinc-400 transition-transform ${calOpen ? "rotate-180" : ""}`}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={locked}
            className="inline-flex min-h-12 shrink-0 items-center rounded-xl border border-zinc-300 px-3 text-sm font-medium text-zinc-700 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 lg:min-h-10 lg:hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800 lg:dark:hover:bg-zinc-800"
          >
            All lives
          </button>
        </div>

        {calOpen && (
          <div className="mt-3 rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
            <MonthCalendar value={day} onChange={pickDay} marks={marks} max={dayKey(new Date())} />
          </div>
        )}

        {dayLives.length > 0 ? (
          <ul className="mt-3 space-y-2" aria-label="Lives on this date">
            {dayLives.map((s) => {
              const on = s.sessionId === sessionId;
              const owed = missingRequired(s.current);
              return (
                <li key={s.sessionId}>
                  <button
                    type="button"
                    onClick={() => pickSession(s.sessionId)}
                    disabled={locked}
                    aria-pressed={on}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-60 ${
                      on
                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-950/40"
                        : "border-zinc-200 active:bg-zinc-50 lg:hover:bg-zinc-50 dark:border-zinc-800 dark:active:bg-zinc-900 lg:dark:hover:bg-zinc-900"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        on ? "border-blue-600 bg-blue-600" : "border-zinc-300 dark:border-zinc-600"
                      }`}
                    >
                      {on && <span className="h-2 w-2 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {new Date(s.startedAt!).toLocaleTimeString("en-MY", {
                          timeZone: "Asia/Kuala_Lumpur",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">
                        <span className="font-mono">@{s.handle}</span>
                        {s.title ? ` · ${s.title}` : ""}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                        owed === 0
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                      }`}
                    >
                      {owed === 0 ? "Complete" : `${owed} missing`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-zinc-300 px-4 py-5 text-center dark:border-zinc-700">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">No live on this date</p>
            <Link
              href={`/tiktok-live/import?mode=missing&date=${day}`}
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white active:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Add it as a missing live
            </Link>
          </div>
        )}
      </section>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Pick a live">
        {sessions.length > 6 && (
          // Pinned, so the box stays in view above the keyboard while typing.
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
            <li className="px-1 py-6 text-center text-sm text-zinc-500">No matching lives.</li>
          )}
          {matches.map((s) => {
            const on = s.sessionId === sessionId;
            const owed = missingRequired(s.current);
            return (
              <li key={s.sessionId}>
                <button
                  type="button"
                  onClick={() => pickSession(s.sessionId)}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                    on ? "bg-blue-50 dark:bg-blue-950/40" : "active:bg-zinc-50 dark:active:bg-zinc-900"
                  }`}
                >
                  <span aria-hidden="true" className="w-4 shrink-0 text-blue-600 dark:text-blue-400">
                    {on ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium tabular-nums">
                      {fmtWhen(s.startedAt)}
                      {on && <span className="sr-only"> (selected)</span>}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      @{s.handle}
                      {s.title ? ` · ${s.title}` : ""}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                      owed === 0
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                    }`}
                  >
                    {owed === 0 ? "Complete" : `${owed} missing`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>

      {selected && (
        <>
          <FormSection
            step={1}
            title="Required results"
            filled={filledCount(REQUIRED_FIELDS, values)}
            total={REQUIRED_FIELDS.length}
            required
          >
            <FieldGrid cols={REQUIRED_FIELDS} values={values} current={selected.current} disabled={locked} onChange={setVal} />
            <div className="mt-3">
              <HelpChip keys={["totalLeads", "filteredLeads", "dms", "bioViews"]} />
            </div>
          </FormSection>

          <FormSection
            step={2}
            title="TikTok Studio"
            filled={filledCount(STUDIO_FIELDS, values)}
            total={STUDIO_FIELDS.length}
            collapsible
          >
            <FieldGrid cols={STUDIO_FIELDS} values={values} current={selected.current} disabled={locked} onChange={setVal} />
          </FormSection>

          <FormSection
            step={3}
            title="Live performance"
            filled={filledCount(AUTO_FIELDS, values)}
            total={AUTO_FIELDS.length}
            collapsible
            defaultOpen={false}
          >
            <FieldGrid cols={AUTO_FIELDS} values={values} current={selected.current} disabled={locked} onChange={setVal} />
          </FormSection>

          <FormSection step={4} title="Product & remarks">
            <div className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">Product / service</div>
            <ProductPicker
              value={products}
              onChange={(next) => {
                setProducts(next);
                setApplied(false);
                setMsg(null);
              }}
              disabled={locked}
            />
            <label
              htmlFor="live-remarks"
              className="mb-2 mt-5 block text-sm font-medium text-zinc-700 dark:text-zinc-200"
            >
              Remarks
            </label>
            <textarea
              id="live-remarks"
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value);
                setApplied(false);
                setMsg(null);
              }}
              disabled={locked}
              rows={3}
              className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base leading-relaxed text-zinc-900 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </FormSection>

          <StickyAction
            label={saveLabel}
            onClick={apply}
            busy={busy}
            disabled={applied || changes.count === 0}
            status={redirecting ? `Saved ✓ — opening your live… (${countdown})` : msg}
            secondary={redirecting ? { label: "Stay here", onClick: stayHere } : undefined}
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
    // One column on a phone, where a 48px box and its "Now 1,234 → 1,340" chip
    // need the full width; two from `sm`, three from `lg`.
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-4 lg:grid-cols-3">
      {cols.map((c) => (
        <NumberField
          key={c}
          col={c}
          label={FIELD_LABEL[c] ?? c}
          value={values[c] ?? ""}
          current={current[c]}
          disabled={disabled}
          onChange={onChange}
          inputClassName="lg:h-10"
        />
      ))}
    </div>
  );
}
