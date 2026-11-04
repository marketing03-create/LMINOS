"use client";

import { useEffect, useRef, useState } from "react";
import { refreshEverywhere } from "@/app/actions/refresh-everywhere";
import { Sheet } from "@/components/mobile/sheet";
import { StickyAction } from "@/components/mobile/sticky-action";

/**
 * New customer / edit customer. One sheet, two jobs: a streamer types a name
 * and phone, picks the live (the newest is already picked), and TT Stars makes
 * the customer's Drive folder with IC / Payslip / Bank Statement inside. The
 * sheet then turns into an "Open folder" button — opened by the tap itself, so
 * no phone blocks it as a pop-up.
 */

export type LiveChoice = { id: string; label: string };

export type CustomerEdit = { id: string; name: string; phone: string; sessionId: string | null };

type Props =
  | { mode: "new"; lives: LiveChoice[]; defaultLiveId?: string }
  | { mode: "edit"; lives: LiveChoice[]; customer: CustomerEdit };

const INPUT =
  "mt-1 block min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus:border-blue-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string; url?: string; created?: boolean }
    | null;
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? `Not saved (${res.status}). Try again.`);
  return json;
}

export function CustomerSheet(props: Props) {
  const isNew = props.mode === "new";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [liveId, setLiveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string; created: boolean } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  function openSheet() {
    if (props.mode === "edit") {
      setName(props.customer.name);
      setPhone(props.customer.phone);
      setLiveId(props.customer.sessionId ?? props.lives[0]?.id ?? "");
    } else {
      setName("");
      setPhone("");
      setLiveId(props.defaultLiveId ?? props.lives[0]?.id ?? "");
    }
    setError(null);
    setDone(null);
    setOpen(true);
  }

  useEffect(() => {
    if (open && !done) nameRef.current?.focus();
  }, [open, done]);

  async function save() {
    if (!liveId) {
      setError("Pick the live.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (props.mode === "edit") {
        await send(`/api/tiktok-live/customers/${props.customer.id}`, "PATCH", {
          name,
          phone,
          sessionId: liveId,
        });
        setOpen(false);
      } else {
        const r = await send("/api/tiktok-live/customers", "POST", { name, phone, sessionId: liveId });
        setDone({ url: r.url!, created: !!r.created });
      }
      void refreshEverywhere();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {isNew ? (
        <button
          type="button"
          onClick={openSheet}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white active:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          + New customer
        </button>
      ) : (
        <button
          type="button"
          onClick={openSheet}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 items-center text-sm font-medium text-zinc-600 active:text-zinc-900 dark:text-zinc-400"
        >
          Edit
        </button>
      )}

      <Sheet
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={isNew ? "New customer" : "Edit customer"}
        footer={
          done ? (
            <div className="px-4 py-3">
              <a
                href={done.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-600 text-base font-semibold text-white active:bg-emerald-700"
              >
                Open folder
              </a>
            </div>
          ) : (
            <StickyAction
              label={isNew ? "Create" : "Save"}
              onClick={save}
              busy={busy}
              status={
                error ? (
                  <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
                ) : busy ? (
                  isNew ? "Making folder…" : "Saving…"
                ) : null
              }
            />
          )
        }
      >
        {done ? (
          <div className="py-2 text-center">
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {done.created ? "Folder ready ✓" : "Already has a folder"}
            </p>
            <p className="mt-1 break-words text-sm text-zinc-500 dark:text-zinc-400">
              {name} · {phone}
            </p>
          </div>
        ) : (
          <form
            className="space-y-4 py-1"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Customer name
              <input
                ref={nameRef}
                className={INPUT}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                autoCapitalize="words"
                disabled={busy}
                maxLength={80}
              />
            </label>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Phone
              <input
                className={INPUT}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="off"
                placeholder="012-345 6789"
                disabled={busy}
                maxLength={20}
              />
            </label>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              From live
              <select
                className={INPUT}
                value={liveId}
                onChange={(e) => setLiveId(e.target.value)}
                disabled={busy || props.lives.length === 0}
              >
                {props.lives.length === 0 && <option value="">No lives in the last 14 days</option>}
                {props.lives.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            {/* Enter on the keyboard submits. */}
            <button type="submit" hidden />
          </form>
        )}
      </Sheet>
    </>
  );
}

/**
 * Re-count documents for the customers on screen as the list opens, then
 * re-render it if anything was checked — so ticks follow what was uploaded.
 */
export function RecountOnOpen({ sessionId }: { sessionId?: string }) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void fetch("/api/tiktok-live/customers/recount", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { checked?: number } | null) => {
        if (j?.checked) void refreshEverywhere();
      })
      .catch(() => {});
  }, [sessionId]);
  return null;
}
