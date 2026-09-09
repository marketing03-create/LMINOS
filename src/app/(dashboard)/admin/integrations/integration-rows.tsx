"use client";

import { useState } from "react";
import { Sheet } from "@/components/mobile/sheet";

/**
 * The three service rows, phone-side.
 *
 * On a laptop each service is a card with a heading, a status word and a
 * sentence of background. At 375px that same sentence is four lines of standing
 * copy about an environment variable, and the row you came to read — is this
 * thing on? — is the two words at the end of a `justify-between` row that will
 * not wrap. So the answer moves onto its own line under the name, and the
 * background moves into a sheet: still one tap away, no longer three lines of
 * permanent chrome per service.
 *
 * `detail` arrives as a finished string. Contract 22 says this page only ever
 * computes *presence* booleans from the environment on the server — the values
 * never cross to the client — and the one exception (the vendor name, which is
 * already printed in today's HTML) is baked into the string by the page. This
 * component cannot read `process.env` and must never be given anything that
 * could.
 *
 * Why the not-configured dot can be zinc rather than amber: for this system the
 * "no vendor configured" state is how production actually runs — capture is the
 * free Fly.io connector, not a paid vendor. An amber dot on a normal steady
 * state is an alarm that never stops ringing, and an alarm nobody can silence
 * is one nobody reads.
 */

export type IntegrationRow = {
  id: string;
  name: string;
  ok: boolean;
  /** Zinc instead of amber for an "off" that is the expected steady state. */
  neutralWhenOff?: boolean;
  /** The one line the sheet shows. Built on the server; no env values. */
  detail: string;
};

export function IntegrationRows({
  rows,
}: {
  rows: IntegrationRow[];
}): React.JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpenId(r.id)}
              aria-haspopup="dialog"
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 dark:active:bg-zinc-800"
            >
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  r.ok
                    ? "bg-emerald-500"
                    : r.neutralWhenOff
                      ? "bg-zinc-400"
                      : "bg-amber-500"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-base font-medium">
                  {r.name}
                </span>
                {/* Under the name, not opposite it. The old row put this in a
                    `justify-between` flex with no wrap, so "not configured"
                    either clipped or shoved the name off the card. */}
                <span
                  className={`mt-0.5 block break-words text-sm ${
                    r.ok
                      ? "text-emerald-600 dark:text-emerald-400"
                      : r.neutralWhenOff
                        ? "text-zinc-500 dark:text-zinc-400"
                        : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {r.ok ? "configured" : "not configured"}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="shrink-0 select-none text-zinc-300 dark:text-zinc-600"
              >
                &rsaquo;
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Sheet
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open?.name ?? ""}
      >
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          {open?.detail}
        </p>
      </Sheet>
    </>
  );
}
