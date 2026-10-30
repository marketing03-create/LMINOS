"use client";

import { refreshEverywhere } from "@/app/actions/refresh-everywhere";
import { useId, useState } from "react";
import { RecordCard } from "@/components/mobile/record-card";
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
 * Handle writes: register, assign a streamer, set lead keywords, pause, stop
 * tracking. The Users page shows handles on their streamer's own row (one
 * table, see users/people-table.tsx); these are the pieces it is built from.
 *
 * `busyId` is scoped to the handle in flight: one row saving must not grey
 * out every other control on the page.
 */
export function useHandleActions() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      void refreshEverywhere();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const patch = (id: string, body: Record<string, unknown>) =>
    call(`/api/tiktok-accounts/${id}`, "PATCH", id, body);
  const remove = (id: string) => call(`/api/tiktok-accounts/${id}`, "DELETE", id);

  return { busyId, error, call, patch, remove };
}

/**
 * Track a new handle. Below `lg` it is one button and a sheet: the desktop
 * form is a `flex-wrap` row of fixed-width inputs that stacks into ragged
 * half-width boxes on a phone, and the sheet's 16px type stops iOS zooming.
 */
export function AddHandle() {
  const { busyId, error, call } = useHandleActions();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const addFormId = useId();

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

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-300 text-base font-medium active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:hidden dark:border-zinc-700 dark:active:bg-zinc-800"
      >
        + Track TikTok handle
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
export function HandleCard({
  row,
  streamers,
  busy,
  onPatch,
  onDelete,
  showStreamer = true,
}: {
  row: TikTokRow;
  streamers: StreamerOption[];
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  /** Off when the card sits under its streamer: the row would repeat them. */
  showStreamer?: boolean;
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
              {row.sessions} {lives}
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
            {showStreamer && (
              <button
                type="button"
                disabled={busy || noLogins}
                onClick={() => setSheet("streamer")}
                className={settingRow}
              >
                <span className={settingLabel}>Assign to</span>
                <span className={settingValue}>
                  <span className="min-w-0 break-words">{streamerLabel}</span>
                  <Chevron />
                </span>
              </button>
            )}

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
        <div className="space-y-2 pb-2">
          {row.assignedStreamerId && (
            <button
              type="button"
              onClick={() => close(() => onPatch({ assignedStreamerId: null }))}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-300 text-base font-medium active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:active:bg-zinc-800"
            >
              Unassign from {assigned?.fullName || assigned?.email || "streamer"}
            </button>
          )}
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

export function KeywordsCell({
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
export const btnSmall =
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

