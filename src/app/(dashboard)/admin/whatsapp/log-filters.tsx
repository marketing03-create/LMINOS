"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CompactDateFilter } from "@/components/compact-date-filter";
import type { RangeChoice } from "@/lib/date-range";

const BASE = "/admin/whatsapp";

/**
 * The WhatsApp log's filter row: the Dashboard's own date control (presets,
 * custom range, ‹ › stepping), the WATI account and a phone search. Each one
 * applies as soon as it changes — no Apply button. Everything stays in the URL
 * (`keep` carries the other filters along), so any view is still a shareable link.
 */
export function LogFilters({
  choice,
  connections,
  conn,
  q,
  keep,
}: {
  choice: RangeChoice;
  connections: { id: string; name: string }[];
  /** Selected WATI connection id, or "". */
  conn: string;
  q: string;
  /** Other filters to carry on every change (status, live, day, streamer). */
  keep: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(q);

  const dateParams: Record<string, string> =
    choice.mode === "custom"
      ? { start: choice.startStr, end: choice.endStr }
      : { range: choice.presetKey ?? "7d" };

  function go(patch: Record<string, string>) {
    const merged: Record<string, string> = { ...dateParams, ...keep, conn, q, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    startTransition(() => router.push(`${BASE}?${p.toString()}`, { scroll: false }));
  }

  const others: Record<string, string> = { ...keep };
  if (conn) others.conn = conn;
  if (q) others.q = q;

  return (
    <div
      className={`mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center ${
        pending ? "opacity-60 transition-opacity" : ""
      }`}
    >
      <CompactDateFilter basePath={BASE} choice={choice} extraParams={others} align="start" />

      <label className="sr-only" htmlFor="wa-conn">
        WATI account
      </label>
      <select
        id="wa-conn"
        value={conn}
        onChange={(e) => go({ conn: e.target.value })}
        className={FIELD}
      >
        <option value="">All WATI accounts</option>
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: search.replace(/\D/g, "").slice(0, 15) });
        }}
        className="relative sm:w-56"
      >
        <label className="sr-only" htmlFor="wa-q">
          Search phone number
        </label>
        <input
          id="wa-q"
          type="search"
          inputMode="numeric"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search phone number"
          className={`${FIELD} w-full pr-10 tabular-nums`}
        />
        {q ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              go({ q: "" });
            }}
            aria-label="Clear search"
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-400 active:text-zinc-600"
          >
            ✕
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Search"
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-400 active:text-zinc-600"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 4 4" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}

const FIELD =
  "h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 sm:h-10 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
