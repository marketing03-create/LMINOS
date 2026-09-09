"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Disclosure } from "@/components/mobile/disclosure";
import { HelpChip } from "@/components/mobile/metric-help-sheet";
import { NoticeStrip, type NoticeItem } from "@/components/mobile/notice-strip";
import { NumberField } from "@/components/mobile/number-field";
import { StickyAction } from "@/components/mobile/sticky-action";
import type { MetricHelpKey } from "@/lib/tiktok-live/metric-help";
import { RemarksInput } from "../remarks-input";
import { ProductSelect } from "./product-select";
import { SessionScreenshotCard, type ReadGroup } from "./session-screenshot-card";

/**
 * The whole editable surface of one live, in one component — because it used to
 * be two, and two was the bug.
 *
 * Before this, the page rendered a screenshot card with fourteen number boxes
 * and a metrics card with eighteen, over the same columns, with two Save
 * buttons that hit two different API routes. Whichever one you typed into, the
 * other one was now wrong on screen, and neither of them carried Total Leads or
 * Filtered Leads — the two numbers that are never on a TikTok screenshot and
 * the only reason a streamer opens this page at all.
 *
 * So: one list. Leads first, always open, always present. The camera moves
 * BELOW it and feeds it, which is why `SessionScreenshotCard` no longer owns
 * any inputs — a read lands here as a pending edit (`Now 1,200 → 1,340`) and is
 * confirmed in the same box it will be saved from.
 *
 * ── The save routing, which is the part to be careful with ──
 *
 * Two routes write these columns and they are not interchangeable:
 *
 *   POST …/apply-screenshot  fires `screenshot_import`, and — for a streamer —
 *                            compares what we send against `screenshotValues`
 *                            and files a `screenshot_mismatch` audit row for
 *                            any difference. An admin sees that row as a popup
 *                            naming the streamer.
 *   PATCH …/sessions/[id]    fires `manual_metrics`. No comparison, no alert.
 *
 * A hand-typed number must therefore never travel in `values` beside a
 * `screenshotValues` that has no entry for it: the route would read "streamer
 * saved 41 where the screenshot said nothing" and accuse someone of editing a
 * figure they simply typed in. `screenshotValues` is the frozen read, exactly as
 * the AI returned it — it has never contained totalLeads/filteredLeads and must
 * not start.
 *
 * The test for provenance is therefore membership of the read, and NOTHING
 * else: `readValues` has an entry for this key, and it is a column the apply
 * route actually writes. Whether a thumb has since corrected the figure is
 * deliberately NOT part of it. A streamer who reads 12 DMs off a screenshot and
 * saves 40 is the exact case `screenshot_mismatch` exists to record; routing
 * that correction down the PATCH leg would file it as an ordinary
 * `manual_metrics` edit and the admin's MismatchAlerts popup would never see
 * it. So a corrected read key still travels in `values`, with the ORIGINAL AI
 * figure still sitting in `screenshotValues`, and the route files the row.
 * Only keys the AI never read — Total Leads, Filtered Leads, anything typed
 * with no screenshot in play — go to PATCH.
 *
 * One consequence of "changed keys only" (below) had to be closed for the same
 * reason: a value that contradicts the frozen read travels on the apply leg
 * even when it equals what is already stored. Otherwise reverting a screenshot
 * figure back to the number already in the database — the cheapest way to bury
 * an inflated one — would be sent nowhere and audited as nothing.
 *
 * We also send CHANGED keys only. The old card sent all eighteen on every save
 * (which is how a blanked AUTO column became 0) — that semantic survives for
 * the keys the user actually touched, and a Save now stops rewriting the
 * fifteen columns they never looked at.
 */

type Field = { key: string; label: string; help: MetricHelpKey };

const LIVE_FIELDS: Field[] = [
  { key: "totalViews", label: "Views", help: "views" },
  { key: "peakViewers", label: "Peak viewers", help: "peak" },
  { key: "avgViewers", label: "Avg viewers", help: "avg" },
  { key: "newFollowers", label: "New followers", help: "followers" },
  { key: "totalLikes", label: "Likes", help: "likes" },
  { key: "totalComments", label: "Comments", help: "comments" },
  { key: "totalShares", label: "Shares", help: "shares" },
  { key: "durationMinutes", label: "Duration (min)", help: "duration" },
];

const BACKEND_FIELDS: Field[] = [
  { key: "uniqueViewers", label: "Unique viewers", help: "unique" },
  { key: "activeViewers", label: "Active viewers", help: "active" },
  { key: "avgWatchSeconds", label: "Avg watch (sec)", help: "watch" },
  { key: "directMessages", label: "Direct messages", help: "dms" },
  { key: "serviceBioViews", label: "Service bio views", help: "bioViews" },
  { key: "interestedViewers", label: "Interested viewers", help: "interested" },
  { key: "diamonds", label: "Diamonds", help: "diamonds" },
];

const LEAD_FIELDS: Field[] = [
  { key: "totalLeads", label: "Total leads", help: "totalLeads" },
  { key: "filteredLeads", label: "Filtered leads", help: "filteredLeads" },
];

// Admins additionally see/edit the auto keyword-comment count.
const ADMIN_LEAD_FIELDS: Field[] = [
  { key: "keywordLeads", label: "PM comments (keyword)", help: "commentLeads" },
];

/**
 * The columns `POST …/apply-screenshot` actually writes (AUTO ∪ MANUAL, plus
 * keywordLeads). It ignores anything else without saying so — `durationMinutes`
 * is the live example, and the extractor keeps it beside `values` rather than in
 * it, so today nothing hits this. It is here anyway: if a future read ever put a
 * key in `values` that the apply route drops, this sends it down the PATCH leg
 * instead of letting the page report a number saved that was thrown away.
 */
const APPLY_COLUMNS = new Set([
  "totalViews",
  "peakViewers",
  "avgViewers",
  "totalLikes",
  "totalComments",
  "totalShares",
  "newFollowers",
  "uniqueViewers",
  "activeViewers",
  "avgWatchSeconds",
  "directMessages",
  "serviceBioViews",
  "interestedViewers",
  "diamonds",
  "totalLeads",
  "filteredLeads",
  "keywordLeads",
]);

/**
 * The columns the PATCH route writes as **0** for a blank, because they are NOT
 * NULL: the seven AUTO columns (`AUTO_TIKTOK_FIELDS`, queries.ts L323) plus
 * `durationMinutes` (→ `duration_seconds`), per sessions/[id]/route.ts L76-100.
 *
 * Blanking one of these is an edit to zero, not a clear, and the local
 * `stored` mirror has to say so. Committing the `null` we sent would leave the
 * field's chip reading "Not entered" over a column the database now holds a
 * real 0 in — P1 inverted — and it would survive `router.refresh()`, because
 * `stored` is deliberately not re-derived from props.
 */
const ZERO_ON_BLANK = new Set([
  "totalViews",
  "peakViewers",
  "avgViewers",
  "totalLikes",
  "totalComments",
  "totalShares",
  "newFollowers",
  "durationMinutes",
]);

/** Raw column key → the label this app shows for it, for conflict strings. */
const LABELS: Record<string, string> = Object.fromEntries(
  [...LIVE_FIELDS, ...BACKEND_FIELDS, ...LEAD_FIELDS, ...ADMIN_LEAD_FIELDS].map((f) => [
    f.key,
    f.label,
  ])
);

/**
 * The extractor writes conflicts as `totalViews: 100 vs 120 (kept first)` —
 * a column name a streamer has never seen. Same sentence, our word for it.
 */
function labelConflict(c: string): string {
  const i = c.indexOf(":");
  if (i < 0) return c;
  const label = LABELS[c.slice(0, i)];
  return label ? `${label}${c.slice(i)}` : c;
}

/** "" → null, everything else → a rounded number. Blank is never 0 here. */
function parseVal(raw: string): number | null | "bad" {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return "bad";
  return Math.round(n);
}

export function SessionEditor({
  sessionId,
  isStreamer,
  aiConfigured,
  sessionDate,
  products,
  remarks,
  initial,
}: {
  sessionId: string;
  isStreamer: boolean;
  aiConfigured: boolean;
  /** This live's date (YYYY-MM-DD, Malaysia time) — to warn on a mismatched photo. */
  sessionDate: string | null;
  products: string[];
  /** This live's saved note. The streamer's Home feed no longer carries one. */
  remarks: string | null;
  initial: Record<string, number | null>;
}) {
  const router = useRouter();
  const leadFields = isStreamer ? LEAD_FIELDS : [...LEAD_FIELDS, ...ADMIN_LEAD_FIELDS];
  const allFields = [...leadFields, ...LIVE_FIELDS, ...BACKEND_FIELDS];

  // What the database holds, as far as we know. Kept in state rather than read
  // from `initial` on every render because `router.refresh()` re-renders the
  // server component into this same client instance: the props update, the
  // state does not, and "Now 1,200" would keep quoting the number we just
  // overwrote. We commit each save into it ourselves.
  const [stored, setStored] = useState<Record<string, number | null>>(() => ({ ...initial }));
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of allFields) o[f.key] = initial[f.key] == null ? "" : String(initial[f.key]);
    return o;
  });
  /** The AI read, frozen exactly as returned. Never edited, only replaced. */
  const [readValues, setReadValues] = useState<Record<string, number> | null>(null);
  const [readGroup, setReadGroup] = useState<ReadGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const update = useCallback((key: string, v: string) => {
    setVals((p) => ({ ...p, [key]: v }));
    // A keystroke answers both the "Saved ✓" and the "that isn't a number"
    // line: leaving either one standing over a box the user is currently
    // retyping is how a stale message gets read as the current state.
    setMsg(null);
    setErr(null);
  }, []);

  function handleRead(g: ReadGroup) {
    setReadGroup(g);
    setReadValues(g.values);
    setVals((p) => {
      const next = { ...p };
      for (const [k, v] of Object.entries(g.values)) if (k in next) next[k] = String(v);
      return next;
    });
    setErr(null);
    setMsg(null);
  }

  function handleDiscard() {
    const read = readValues;
    setReadGroup(null);
    setReadValues(null);
    if (!read) return;
    setVals((p) => {
      const next = { ...p };
      for (const k of Object.keys(read)) {
        if (k in next) next[k] = stored[k] == null ? "" : String(stored[k]);
      }
      return next;
    });
  }

  /**
   * The `→ 1,340` half of a field's chip. Only ever shown for a key the AI
   * actually read, and it tracks the box rather than the read, so correcting a
   * misread updates the arrow instead of leaving it quoting a number that is no
   * longer going to be saved. `NumberField` drops it when it matches `current`.
   */
  function pendingFor(key: string): number | undefined {
    if (!readValues || !(key in readValues)) return undefined;
    const parsed = parseVal(vals[key] ?? "");
    return typeof parsed === "number" ? parsed : undefined;
  }

  async function post(url: string, method: "POST" | "PATCH", body: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      throw new Error(json.error ?? `Failed (${res.status}).`);
    }
  }

  async function save() {
    setMsg(null);
    setErr(null);

    const screenshotBacked: Record<string, number> = {};
    const handEdited: Record<string, number | null> = {};
    for (const f of allFields) {
      const parsed = parseVal(vals[f.key] ?? "");
      if (parsed === "bad") {
        setErr(`${f.label}: use a number of 0 or more.`);
        return;
      }
      // `keyword_leads` is NOT NULL and BOTH routes deliberately IGNORE a blank
      // for it — "blank = keep the auto count" (sessions/[id]/route.ts:103-116,
      // apply-screenshot/route.ts:56-69). Sending null anyway is a silent
      // failure, not a clear: the PATCH drops the key, the audit row never
      // mentions it, and we would still report "Saved ✓" and commit `null` into
      // `stored` — so the chip would read "Not entered" over a count that is
      // still 42 in the database. Send nothing and stay honest. (Admin-only
      // field; the AI never reads it, so this can't touch screenshot routing.)
      if (f.key === "keywordLeads" && parsed === null) continue;
      // Provenance, and the whole of it: the AI read this key, and the apply
      // route is one that actually writes that column. A correction keeps its
      // provenance — that is what makes the mismatch row possible.
      const read =
        readValues && f.key in readValues && APPLY_COLUMNS.has(f.key)
          ? readValues[f.key]
          : undefined;
      const unchanged = parsed === (stored[f.key] ?? null);
      // `parsed !== null` on purpose: apply-screenshot 400s on a blank AUTO
      // column, so CLEARING a number is always a PATCH, never an import.
      if (read !== undefined && parsed !== null && (!unchanged || parsed !== read)) {
        screenshotBacked[f.key] = parsed;
        continue;
      }
      if (unchanged) continue; // untouched column, left alone
      handEdited[f.key] = parsed;
    }

    const hasShots = Object.keys(screenshotBacked).length > 0;
    const hasManual = Object.keys(handEdited).length > 0;
    if (!hasShots && !hasManual) {
      setMsg("Nothing changed yet.");
      return;
    }

    setBusy(true);
    try {
      if (hasShots) {
        await post(`/api/tiktok-live/sessions/${sessionId}/apply-screenshot`, "POST", {
          values: screenshotBacked,
          // Frozen, byte-for-byte. This is what the mismatch check reads.
          screenshotValues: readValues,
        });
        // Committed before the PATCH so a failure on the second leg can be
        // retried without re-posting an import that already landed.
        setStored((p) => ({ ...p, ...screenshotBacked }));
        setReadGroup(null);
        setReadValues(null);
      }
      if (hasManual) {
        await post(`/api/tiktok-live/sessions/${sessionId}`, "PATCH", handEdited);
        // Commit what the route STORED, not what we sent — see ZERO_ON_BLANK.
        // A blanked AUTO column (or duration) is now a 0 in the database, so
        // the box and its chip have to read 0 rather than "Not entered".
        const committed: Record<string, number | null> = {};
        for (const [k, v] of Object.entries(handEdited)) {
          committed[k] = v === null && ZERO_ON_BLANK.has(k) ? 0 : v;
        }
        setStored((p) => ({ ...p, ...committed }));
        setVals((p) => {
          const next = { ...p };
          for (const [k, v] of Object.entries(committed)) {
            if (handEdited[k] === null && v !== null) next[k] = String(v);
          }
          return next;
        });
      }
      setMsg("Saved ✓");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // A photo dated differently from this live is the one mistake worth catching
  // before it overwrites good numbers — warn, but let them proceed.
  const dateMismatch =
    readGroup?.date && sessionDate && readGroup.date !== sessionDate ? readGroup.date : null;

  const notices: NoticeItem[] = [];
  if (dateMismatch) {
    notices.push({
      key: "date-mismatch",
      tone: "amber",
      short: `These screenshots look like ${dateMismatch}, but this live is ${sessionDate}.`,
      full: "Check you opened the right live before you save.",
    });
  }
  for (const c of readGroup?.conflicts ?? []) {
    notices.push({ key: `conflict-${c}`, tone: "amber", short: labelConflict(c) });
  }

  const sectionCard =
    "rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950";

  return (
    <div className="space-y-6">
      <NoticeStrip items={notices} />

      {/* The DOM order here is today's desktop order — screenshots, products,
          metrics — and the phone's order is done with `order-*` instead of by
          moving the markup. That is P5's mechanism: at `lg` the utilities are
          overridden back to 1-2-3, so the 1280px render is section-for-section
          what it was, while the phone gets the list it came for first and the
          camera underneath it.
          The cost is honest and worth naming: below `lg` the reading/tab order
          stays screenshots → products → metrics while the visual order is
          metrics → screenshots → products. Each section carries its own heading,
          so a linear reader still gets a coherent page — but if this ever grows
          a fourth section, reorder the markup and take the desktop diff instead
          of stacking a second `order-*` on top. */}
      <div className="flex flex-col gap-6">
        <section className="order-2 lg:order-1">
          <SessionScreenshotCard
            sessionId={sessionId}
            aiConfigured={aiConfigured}
            active={!!readValues}
            disabled={busy}
            onRead={handleRead}
            onDiscard={handleDiscard}
          />
        </section>

        <section className="order-3 lg:order-2">
          <ProductSelect sessionId={sessionId} initial={products} />
        </section>

        <section className={`order-1 px-1 py-4 lg:order-3 ${sectionCard}`}>
          <h2 className="px-4 text-[17px] font-semibold text-zinc-900 lg:text-sm lg:font-semibold lg:uppercase lg:tracking-wider lg:text-zinc-500 dark:text-zinc-100 dark:lg:text-zinc-500">
            Session metrics
          </h2>

          {/* Leads first and open by default, whether or not a screenshot was
              ever read. These two never appear on a TikTok analytics screen, so
              putting them anywhere else is what made the old page need a
              paragraph explaining where they were. */}
          <Group
            title="Leads"
            fields={leadFields}
            helpKeys={leadFields.map((f) => f.help)}
            defaultOpen
            vals={vals}
            stored={stored}
            pendingFor={pendingFor}
            onChange={update}
            disabled={busy}
          />
          <Group
            title="Live performance"
            fields={LIVE_FIELDS}
            helpKeys={LIVE_FIELDS.map((f) => f.help)}
            vals={vals}
            stored={stored}
            pendingFor={pendingFor}
            onChange={update}
            disabled={busy}
          />
          {/* One name for these seven fields everywhere in the app. */}
          <Group
            title="TikTok backend"
            fields={BACKEND_FIELDS}
            helpKeys={BACKEND_FIELDS.map((f) => f.help)}
            vals={vals}
            stored={stored}
            pendingFor={pendingFor}
            onChange={update}
            disabled={busy}
          />
        </section>

        {/* Remarks. It sits inside the ordered flex — last in both orders, so
            no desktop diff — rather than after this component, because the
            docked Save is `sticky` and a sticky element only pins within its
            own parent: a note box below it would scroll with the bar already
            unpinned.
            It keeps its OWN `PATCH {remarks}`, and therefore its own
            `tiktok_live_session.manual_metrics` audit row. Folding the note
            into the numbers Save would merge two different edits into one
            audit entry — and would post a note every time somebody saved a
            number. */}
        <section className={`order-4 p-5 ${sectionCard}`}>
          <h2 className="mb-3 text-[17px] font-semibold text-zinc-900 lg:text-sm lg:font-semibold lg:uppercase lg:tracking-wider lg:text-zinc-500 dark:text-zinc-100 dark:lg:text-zinc-500">
            Remarks
          </h2>
          <RemarksInput sessionId={sessionId} initial={remarks} withSave />
        </section>
      </div>

      {/* The one docked Save on this route (SA-1). It sits outside the ordered
          flex box on purpose: a sticky element is pinned only within its own
          parent, so putting it beside the metrics section would unpin it the
          moment the products card scrolled into view — exactly halfway through
          the job it exists for. */}
      <StickyAction
        label={busy ? "Saving…" : "Save numbers"}
        onClick={save}
        busy={busy}
        status={
          err ? (
            <span className="text-red-600 dark:text-red-400">{err}</span>
          ) : msg ? (
            <span className="text-emerald-600 dark:text-emerald-400">{msg}</span>
          ) : null
        }
      />
    </div>
  );
}

function Group({
  title,
  fields,
  helpKeys,
  defaultOpen,
  vals,
  stored,
  pendingFor,
  onChange,
  disabled,
}: {
  title: string;
  fields: Field[];
  helpKeys: MetricHelpKey[];
  defaultOpen?: boolean;
  vals: Record<string, string>;
  stored: Record<string, number | null>;
  pendingFor: (key: string) => number | undefined;
  onChange: (key: string, v: string) => void;
  disabled: boolean;
}) {
  return (
    <Disclosure
      title={title}
      count={`${fields.length} numbers`}
      defaultOpen={defaultOpen}
      headingLevel={3}
    >
      {/* One chip per group replaces the eight `HelpTip`s that used to sit on
          the labels: a 16px `?` between a label and a right-aligned input is a
          target a thumb cannot hit, and eight of them per group is eight ways
          to mis-tap into the field beside it. The chip is `lg:hidden` by
          construction — so the wrapper drops its margin at `lg` too, or every
          group on the desktop card gains 12px of empty space above a chip that
          isn't rendered (P5). */}
      <div className="mb-3 lg:mb-0">
        <HelpChip keys={helpKeys} />
      </div>
      {/* Single column on a phone; today's two-column desktop grid from `sm`.
          The rows are looser than the old `py-1.5` because each one now carries
          a `Now … → …` chip above a 48px box. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-10 lg:gap-y-2">
        {fields.map((f) => (
          <NumberField
            key={f.key}
            col={f.key}
            label={f.label}
            value={vals[f.key] ?? ""}
            current={stored[f.key] ?? null}
            pending={pendingFor(f.key)}
            onChange={onChange}
            disabled={disabled}
          />
        ))}
      </div>
    </Disclosure>
  );
}
