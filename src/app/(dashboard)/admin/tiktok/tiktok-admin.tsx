"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { MobileTable } from "@/components/mobile/mobile-table";
import { RecordCard, RecordList } from "@/components/mobile/record-card";
import { Sheet } from "@/components/mobile/sheet";

export type TikTokRow = {
  id: string;
  handle: string;
  displayName: string;
  isActive: boolean;
  leadKeywords: string[] | null;
  lastSyncedAt: string | Date | null;
  assignedStreamerId: string | null;
  sessions: number;
};

export type StreamerOption = {
  id: string;
  email: string;
  fullName: string | null;
};

/** The `busyId` slot the add-handle form claims. No account can own this id. */
const ADD_KEY = "__add__";

/**
 * Handle management: register a handle, assign it a streamer, set its lead
 * keywords, pause it, stop tracking it.
 *
 * The eight-column table below `lg` was the worst control surface in the admin
 * area: about 1,000px of grid inside `overflow-x-auto`, with a 160px <select>
 * and a 176px text input parked in columns three and four. At 375px you could
 * see the handle or you could see the controls, never both, and the two you
 * could eventually reach — Pause and Delete — were 24px tall and 8px apart, so
 * the irreversible one sat inside the mis-tap radius of the reversible one.
 *
 * `MobileTable` keeps that table exactly as it is for the laptop and hands the
 * phone a card per handle instead: three labelled rows that open a `Sheet`
 * apiece, and Delete moved behind "More" and a confirm sheet, which is the only
 * arrangement where a destructive action cannot be reached by a slipped thumb.
 * Every write is the same request it always was — the sheets change where you
 * press, never what gets sent.
 *
 * One real behaviour change, deliberate: `busy` used to be a single flag for
 * the whole component, so saving one handle's keywords greyed out every control
 * on the page. On a table that read as "the app is thinking". On a list of
 * cards it reads as "everything broke", so it is now scoped to the row that is
 * actually in flight.
 */
export function TikTokAdmin({
  rows,
  streamers,
}: {
  rows: TikTokRow[];
  streamers: StreamerOption[];
}) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const addFormId = useId();

  async function call(url: string, method: string, who: string, body?: unknown) {
    setBusyId(who);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setError(json.error ?? `Request failed (${res.status}).`);
        return false;
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call("/api/tiktok-accounts", "POST", ADD_KEY, {
      handle,
      displayName,
    });
    if (ok) {
      setHandle("");
      setDisplayName("");
      setAddOpen(false);
    }
  }

  const adding = busyId === ADD_KEY;

  // The existing grid, byte for byte. `MobileTable` renders it inside its own
  // `hidden lg:block` wrapper, so at `lg` this is the same table in the same
  // place with the same widths.
  const table = (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
          <tr>
            <Th>Handle</Th>
            <Th>Name</Th>
            <Th>Streamer</Th>
            <Th>Lead keywords</Th>
            <Th className="text-right">Sessions</Th>
            <Th>Last synced</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                No handles tracked yet. Add one above.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-900">
              <Td className="font-mono">
                <Link
                  href={`/admin/tiktok/${r.id}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  @{r.handle}
                </Link>
              </Td>
              <Td>{r.displayName}</Td>
              <Td>
                <StreamerCell
                  value={r.assignedStreamerId}
                  streamers={streamers}
                  busy={busyId === r.id}
                  onSave={(val) =>
                    call(`/api/tiktok-accounts/${r.id}`, "PATCH", r.id, {
                      assignedStreamerId: val,
                    })
                  }
                />
              </Td>
              <Td>
                <KeywordsCell
                  initial={(r.leadKeywords ?? []).join(", ")}
                  busy={busyId === r.id}
                  onSave={(val) =>
                    call(`/api/tiktok-accounts/${r.id}`, "PATCH", r.id, {
                      leadKeywords: val,
                    })
                  }
                />
              </Td>
              <Td className="text-right tabular-nums">{r.sessions}</Td>
              <Td className="text-xs text-zinc-500">
                {r.lastSyncedAt
                  ? new Date(r.lastSyncedAt).toLocaleString("en-MY", { hour12: false })
                  : "—"}
              </Td>
              <Td>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    r.isActive
                      ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {r.isActive ? "active" : "paused"}
                </span>
              </Td>
              <Td className="text-right">
                <div className="inline-flex gap-2 justify-end">
                  <button
                    onClick={() =>
                      call(`/api/tiktok-accounts/${r.id}`, "PATCH", r.id, {
                        isActive: !r.isActive,
                      })
                    }
                    disabled={busyId === r.id}
                    className={btnSmall}
                  >
                    {r.isActive ? "Pause" : "Resume"}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Stop tracking @${r.handle} and delete its sessions?`))
                        call(`/api/tiktok-accounts/${r.id}`, "DELETE", r.id);
                    }}
                    disabled={busyId === r.id}
                    className={btnSmall}
                  >
                    Delete
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const cards = (
    <RecordList>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No handles tracked yet.
        </p>
      ) : (
        rows.map((r) => (
          <HandleCard
            key={r.id}
            row={r}
            streamers={streamers}
            busy={busyId === r.id}
            onPatch={(body) =>
              call(`/api/tiktok-accounts/${r.id}`, "PATCH", r.id, body)
            }
            onDelete={() => call(`/api/tiktok-accounts/${r.id}`, "DELETE", r.id)}
          />
        ))
      )}
    </RecordList>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Below `lg` the add form is one button and a sheet. The desktop form is
          a `flex-wrap` row of fixed-width inputs with no `w-full` anywhere, so
          on a phone it stacks into three ragged half-width boxes; a sheet gives
          the two fields the full width and the 16px type that stops iOS zooming
          the page the moment you tap one. */}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-zinc-900 text-base font-medium text-zinc-50 active:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 lg:hidden dark:bg-zinc-50 dark:text-zinc-900 dark:active:bg-zinc-300 dark:focus-visible:ring-offset-zinc-950"
      >
        + Add handle
      </button>

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Track a new handle"
        footer={
          <button
            type="submit"
            form={addFormId}
            disabled={adding}
            className="mb-1 flex h-12 w-full items-center justify-center rounded-xl bg-zinc-900 text-base font-medium text-zinc-50 active:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:active:bg-zinc-300"
          >
            {adding ? "Saving…" : "Track handle"}
          </button>
        }
      >
        <form id={addFormId} onSubmit={add} className="space-y-4 pb-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">TikTok @handle</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@yourbrand"
              className={sheetInputCls}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              Display name{" "}
              <span className="text-zinc-500 dark:text-zinc-400">(optional)</span>
            </span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your Brand"
              className={sheetInputCls}
            />
          </label>
        </form>
      </Sheet>

      <form
        onSubmit={add}
        className="hidden border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4 lg:flex flex-wrap items-end gap-3"
      >
        <label className="block">
          <div className="text-xs font-medium mb-1">TikTok @handle</div>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@yourbrand"
            className={inputCls}
            required
          />
        </label>
        <label className="block">
          <div className="text-xs font-medium mb-1">
            Display name <span className="text-zinc-400">(optional)</span>
          </div>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your Brand"
            className={inputCls}
          />
        </label>
        <button type="submit" disabled={adding} className={btnPrimary}>
          {adding ? "Saving…" : "+ Track handle"}
        </button>
      </form>

      {/* No "show the full grid" escape here. Everywhere else that hatch reveals
          numbers to read; this table is controls, and revealing it on a phone
          would hand back the 160px select and the 24px Delete this card list
          exists to replace. */}
      <MobileTable table={table} cards={cards} allowEscape={false} />
    </div>
  );
}

type SheetKind = "streamer" | "keywords" | "more" | "delete";

/**
 * One handle, as a card. The three settings rows each open a sheet rather than
 * holding an inline control, because an inline <select> and an inline text
 * field are precisely what made the table unusable at 375px — and because a
 * sheet can show a streamer's full email instead of truncating it to fit 160px.
 */
function HandleCard({
  row,
  streamers,
  busy,
  onPatch,
  onDelete,
}: {
  row: TikTokRow;
  streamers: StreamerOption[];
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [keywords, setKeywords] = useState((row.leadKeywords ?? []).join(", "));

  const assigned = streamers.find((s) => s.id === row.assignedStreamerId) ?? null;
  const noLogins = streamers.length === 0;
  const streamerLabel = assigned
    ? assigned.fullName
      ? `${assigned.fullName} (${assigned.email})`
      : assigned.email
    : noLogins
      ? "No streamer logins yet"
      : "Unassigned";
  const keywordLabel = (row.leadKeywords ?? []).join(", ") || "None set";
  const lives = row.sessions === 1 ? "live" : "lives";

  async function close(run: () => Promise<boolean>) {
    setSheet(null);
    await run();
  }

  return (
    <>
      <RecordCard
        href={`/admin/tiktok/${row.id}`}
        title={<span className="font-mono">@{row.handle}</span>}
        meta={
          <>
            <span className="block">
              {row.displayName || "No display name"} · {row.sessions} {lives}
            </span>
            {/* "Never synced", not "—". A dash here reads as zero, and zero
                would be a claim about the connector that nobody has made. */}
            <span className="block">
              {row.lastSyncedAt
                ? `Last synced ${new Date(row.lastSyncedAt).toLocaleString("en-MY", {
                    hour12: false,
                  })}`
                : "Never synced"}
            </span>
          </>
        }
        status={{
          label: row.isActive ? "Active" : "Paused",
          tone: row.isActive ? "emerald" : "zinc",
        }}
        action={
          // Pulled back out to the card's edges so each row's press state runs
          // full bleed while its text still lines up with the title above it.
          <div className="-mx-4 w-[calc(100%+2rem)] divide-y divide-zinc-100 dark:divide-zinc-800">
            <button
              type="button"
              disabled={busy || noLogins}
              onClick={() => setSheet("streamer")}
              className={settingRow}
            >
              <span className={settingLabel}>Streamer</span>
              <span className={settingValue}>
                <span className="min-w-0 break-words">{streamerLabel}</span>
                <Chevron />
              </span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setKeywords((row.leadKeywords ?? []).join(", "));
                setSheet("keywords");
              }}
              className={settingRow}
            >
              <span className={settingLabel}>Keywords</span>
              <span className={settingValue}>
                <span className="min-w-0 break-words">{keywordLabel}</span>
                <Chevron />
              </span>
            </button>

            {/* A switch, not a Pause/Resume button: the button's label named the
                action while the chip beside it named the state, so the row said
                "active" and "Pause" at the same time and you had to work out
                which one was the truth. */}
            <button
              type="button"
              role="switch"
              aria-checked={row.isActive}
              disabled={busy}
              onClick={() => onPatch({ isActive: !row.isActive })}
              className={settingRow}
            >
              <span className={settingLabel}>Status</span>
              <span className="flex shrink-0 items-center gap-2 text-sm font-medium">
                {row.isActive ? "Active" : "Paused"}
                <span
                  aria-hidden="true"
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    row.isActive
                      ? "bg-emerald-500"
                      : "bg-zinc-300 dark:bg-zinc-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
                      row.isActive ? "left-[1.375rem]" : "left-0.5"
                    }`}
                  />
                </span>
              </span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => setSheet("more")}
              className={settingRow}
            >
              <span className={settingLabel}>More</span>
              <span className={settingValue}>
                <Chevron />
              </span>
            </button>
          </div>
        }
      />

      <Sheet
        open={sheet === "streamer"}
        onClose={() => setSheet(null)}
        title={`Streamer for @${row.handle}`}
      >
        <ul className="divide-y divide-zinc-100 pb-2 dark:divide-zinc-800">
          <li>
            <button
              type="button"
              onClick={() => close(() => onPatch({ assignedStreamerId: null }))}
              className={pickRow}
            >
              <span className="min-w-0 break-words">Unassigned</span>
              {row.assignedStreamerId === null && <Tick />}
            </button>
          </li>
          {streamers.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => close(() => onPatch({ assignedStreamerId: s.id }))}
                className={pickRow}
              >
                <span className="min-w-0 break-words">
                  {s.fullName ? `${s.fullName} (${s.email})` : s.email}
                </span>
                {row.assignedStreamerId === s.id && <Tick />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet
        open={sheet === "keywords"}
        onClose={() => setSheet(null)}
        title={`Lead keywords for @${row.handle}`}
        footer={
          <button
            type="button"
            onClick={() => close(() => onPatch({ leadKeywords: keywords }))}
            className="mb-1 flex h-12 w-full items-center justify-center rounded-xl bg-zinc-900 text-base font-medium text-zinc-50 active:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:active:bg-zinc-300"
          >
            Save keywords
          </button>
        }
      >
        {/* The placeholder carries the format, so there is no sentence here
            explaining that a comma separates two words. */}
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          aria-label="Lead keywords, separated by commas"
          placeholder="lend, loan, pinjaman"
          className={sheetInputCls}
        />
      </Sheet>

      <Sheet
        open={sheet === "more"}
        onClose={() => setSheet(null)}
        title={`@${row.handle}`}
      >
        <div className="pb-2">
          <button
            type="button"
            onClick={() => setSheet("delete")}
            className="flex h-12 w-full items-center justify-center rounded-xl border border-red-300 text-base font-medium text-red-600 active:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-900 dark:text-red-400 dark:active:bg-red-950/40"
          >
            Stop tracking @{row.handle}
          </button>
        </div>
      </Sheet>

      {/* The same confirmation `window.confirm` gives the laptop, in a form a
          thumb can actually read before it agrees to delete someone's history.
          The request it guards is unchanged. */}
      <Sheet
        open={sheet === "delete"}
        onClose={() => setSheet(null)}
        title={`Stop tracking @${row.handle}?`}
        footer={
          <div className="mb-1 space-y-2">
            <button
              type="button"
              onClick={() => close(onDelete)}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-red-600 text-base font-medium text-white active:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Delete @{row.handle}
            </button>
            <button
              type="button"
              onClick={() => setSheet(null)}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-300 text-base font-medium active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:active:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        }
      >
        <p className="pb-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          This also deletes the {row.sessions} recorded {lives} for this handle.
          It cannot be undone.
        </p>
      </Sheet>
    </>
  );
}

function Chevron() {
  return (
    <span aria-hidden="true" className="shrink-0 text-zinc-300 dark:text-zinc-600">
      &rsaquo;
    </span>
  );
}

/**
 * The picker's only "this is the current value" cue. The glyph alone is colour
 * and shape — nothing a screen reader can read — so the word rides with it and
 * joins the row button's accessible name ("Unassigned, Selected"). Without it
 * the assignment sheet reads as a list of identical choices and there is no way
 * to hear which streamer a handle is on today.
 */
function Tick() {
  return (
    <span className="shrink-0 text-blue-600 dark:text-blue-400">
      <span className="sr-only">Selected</span>
      <span aria-hidden="true">✓</span>
    </span>
  );
}

function StreamerCell({
  value,
  streamers,
  busy,
  onSave,
}: {
  value: string | null;
  streamers: StreamerOption[];
  busy: boolean;
  onSave: (val: string | null) => void;
}) {
  if (streamers.length === 0) {
    return (
      <span className="text-xs text-zinc-400">
        No streamer logins yet
      </span>
    );
  }
  return (
    <select
      value={value ?? ""}
      disabled={busy}
      onChange={(e) => onSave(e.target.value || null)}
      className="w-40 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs disabled:opacity-50"
    >
      <option value="">— none —</option>
      {streamers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.fullName ? `${s.fullName} (${s.email})` : s.email}
        </option>
      ))}
    </select>
  );
}

function KeywordsCell({
  initial,
  busy,
  onSave,
}: {
  initial: string;
  busy: boolean;
  onSave: (val: string) => void;
}) {
  const [val, setVal] = useState(initial);
  const dirty = val.trim() !== initial.trim();
  return (
    <div className="flex items-center gap-1">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="lend, loan, pinjaman"
        className="w-44 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
      />
      {dirty && (
        <button onClick={() => onSave(val)} disabled={busy} className={btnSmall}>
          Save
        </button>
      )}
    </div>
  );
}

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";
const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
const btnSmall =
  "inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2.5 py-1 text-xs disabled:opacity-50";

/** 16px on the phone so iOS Safari does not zoom the page on focus. */
const sheetInputCls =
  "h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

const settingRow =
  "flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:opacity-50 dark:active:bg-zinc-800";
const settingLabel = "shrink-0 text-sm text-zinc-500 dark:text-zinc-400";
const settingValue =
  "flex min-w-0 items-center gap-2 break-words text-right text-sm font-medium";
const pickRow =
  "flex min-h-12 w-full items-center justify-between gap-3 px-1 py-2 text-left text-base active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:active:bg-zinc-800";

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2.5 font-medium text-xs uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
}
