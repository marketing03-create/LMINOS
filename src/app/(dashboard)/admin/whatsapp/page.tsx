import Link from "next/link";
import { rangeFromParams, RANGE_PRESETS } from "@/lib/date-range";
import { requireAdminPage } from "@/lib/auth/page-guard";
import { whatsappLog, type LogResult, type LogRow, type LogStatus } from "@/lib/wati/log";
import { RevealPhone } from "./reveal-phone";

/**
 * WhatsApp log — every customer who WhatsApp'd a connected WATI account, one
 * row each: when, which account, their first message, the live they were
 * counted for (or why not) and the CS reply. Admin only. Every WhatsApp number
 * on the Dashboard and TikTok Live links here with its own filters, so the
 * rows ARE that number (lib/wati/log.ts uses the same rules).
 */

type SP = {
  range?: string;
  start?: string;
  end?: string;
  streamer?: string;
  conn?: string;
  day?: string;
  live?: string;
  status?: string;
  q?: string;
};

const STATUSES: { key: LogStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "replied", label: "Replied" },
  { key: "waiting", label: "No reply yet" },
  { key: "untracked", label: "Not tracked" },
];

const timeFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dateFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dayFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "UTC", // a `day` param is already a Malaysia date
  weekday: "short",
  day: "numeric",
  month: "short",
});

function fmtMin(m: number): string {
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}

const UUID = /^[0-9a-f-]{36}$/i;

export default async function WhatsAppLogPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;

  // A preset picked in the form wins over the custom dates it carries along.
  const choice = sp.range
    ? rangeFromParams({ range: sp.range })
    : rangeFromParams({ start: sp.start, end: sp.end });
  const status: LogStatus = (["all", "tracked", "replied", "waiting", "untracked"] as const).includes(
    sp.status as LogStatus
  )
    ? (sp.status as LogStatus)
    : "all";
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : undefined;
  const live = sp.live && UUID.test(sp.live) ? sp.live : undefined;
  const streamer = sp.streamer && UUID.test(sp.streamer) ? sp.streamer : undefined;
  const connIds = (sp.conn ?? "").split(",").filter((c) => UUID.test(c));
  const q = (sp.q ?? "").replace(/\D/g, "").slice(0, 15);

  let data: LogResult | null = null;
  let error: string | null = null;
  try {
    data = await whatsappLog({
      range: choice.range,
      accountId: streamer,
      connIds,
      day,
      liveId: live,
      status,
      q,
    });
  } catch (err) {
    console.error("[whatsapp-log] failed:", err);
    error = "The WhatsApp log couldn't load. Try again in a moment.";
  }

  // Links keep every current filter and change one.
  const href = (patch: Partial<Record<keyof SP, string | undefined>>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/whatsapp${s ? `?${s}` : ""}`;
  };

  const chips: { label: string; clear: Partial<Record<keyof SP, undefined>> }[] = [];
  if (data?.live)
    chips.push({
      label: `Live: @${data.live.handle} · ${timeFmt.format(data.live.startedAt)}`,
      clear: { live: undefined },
    });
  if (day) chips.push({ label: dayFmt.format(new Date(`${day}T00:00:00Z`)), clear: { day: undefined } });
  if (streamer) chips.push({ label: "One streamer's WATI account", clear: { streamer: undefined } });
  if (status === "tracked") chips.push({ label: "Reply tracked", clear: { status: undefined } });

  return (
    <div className="px-4 py-5 sm:p-8">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">WhatsApp log</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {data?.live ? "Customers counted for this live" : choice.label}
        </p>
      </header>

      {/* Filters — a plain GET form, so every view is a shareable link. */}
      <form method="get" className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        {live && <input type="hidden" name="live" value={live} />}
        {day && <input type="hidden" name="day" value={day} />}
        {streamer && <input type="hidden" name="streamer" value={streamer} />}
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Period</span>
          <select name="range" defaultValue={choice.presetKey ?? ""} className={FIELD}>
            {choice.mode === "custom" && <option value="">{choice.label}</option>}
            {RANGE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">WATI account</span>
          <select name="conn" defaultValue={connIds.length === 1 ? connIds[0] : ""} className={FIELD}>
            <option value="">All accounts</option>
            {data?.connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 block sm:col-span-1">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Phone digits</span>
          <input
            name="q"
            inputMode="numeric"
            defaultValue={q}
            placeholder="e.g. 8160"
            className={`${FIELD} tabular-nums sm:w-36`}
          />
        </label>
        {choice.mode === "custom" && (
          <>
            <input type="hidden" name="start" value={choice.startStr} />
            <input type="hidden" name="end" value={choice.endStr} />
          </>
        )}
        <button
          type="submit"
          className="col-span-2 flex h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white active:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:col-span-1 sm:h-10"
        >
          Apply
        </button>
      </form>

      <nav aria-label="Reply status" className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const on = s.key === status || (s.key === "all" && status === "tracked");
          return (
            <Link
              key={s.key}
              href={href({ status: s.key === "all" ? undefined : s.key })}
              aria-current={on ? "page" : undefined}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium ${
                on
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-zinc-300 text-zinc-700 active:bg-zinc-100 lg:hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800 lg:dark:hover:bg-zinc-800"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
        {chips.map((c) => (
          <Link
            key={c.label}
            href={href(c.clear)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-zinc-100 px-3 text-sm font-medium text-zinc-700 active:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {c.label}
            <span aria-hidden="true" className="text-zinc-400">
              ✕
            </span>
            <span className="sr-only">(remove filter)</span>
          </Link>
        ))}
      </nav>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      {data && (
        <>
          <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Tile label="Customers" value={data.summary.customers} />
            <Tile label="Replied" value={data.summary.replied} />
            <Tile label="No reply yet" value={data.summary.waiting} warn={data.summary.waiting > 0} />
            <Tile label="Not tracked" value={data.summary.untracked} />
            <Tile label="Counted for a live" value={data.summary.counted} />
          </dl>

          {data.rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No customers match.
            </div>
          ) : (
            <>
              {/* Phone: one card per customer. */}
              <ul className="space-y-3 lg:hidden">
                {data.rows.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold">{r.name || "No name"}</div>
                        <div className="text-sm text-zinc-500">
                          <RevealPhone id={r.id} last4={r.phoneLast4} />
                        </div>
                      </div>
                      <Reply r={r} />
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      {timeFmt.format(r.firstMessageAt)} · {r.connectionName}
                    </div>
                    {r.firstMessageText && (
                      <p className="mt-2 line-clamp-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                        “{r.firstMessageText}”
                      </p>
                    )}
                    <div className="mt-2 text-sm">
                      <Counted r={r} />
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop: the same rows as a table. */}
              <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:block">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-900">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">First message</th>
                      <th className="px-3 py-2.5 font-medium">Customer</th>
                      <th className="px-3 py-2.5 font-medium">WATI account</th>
                      <th className="px-3 py-2.5 font-medium">Message</th>
                      <th className="px-3 py-2.5 font-medium">Counted for</th>
                      <th className="px-3 py-2.5 font-medium">CS reply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} className="border-t border-zinc-100 align-top dark:border-zinc-900">
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-300">
                          {timeFmt.format(r.firstMessageAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{r.name || "No name"}</div>
                          <div className="text-zinc-500">
                            <RevealPhone id={r.id} last4={r.phoneLast4} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">{r.connectionName}</td>
                        <td className="max-w-[280px] px-3 py-2.5 text-zinc-600 dark:text-zinc-300">
                          <span className="line-clamp-2">{r.firstMessageText ?? "—"}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Counted r={r} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <Reply r={r} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data.truncated && (
                <p className="mt-3 text-sm text-zinc-500">
                  Showing the newest {data.rows.length} of {data.total}. Narrow the period to see the rest.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

const FIELD =
  "h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 sm:h-10 sm:w-auto sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function Tile({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950">
      <dt className="text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={`mt-0.5 text-xl font-semibold tabular-nums ${
          warn ? "text-amber-600 dark:text-amber-400" : ""
        }`}
      >
        {value.toLocaleString("en-MY")}
      </dd>
    </div>
  );
}

function Reply({ r }: { r: LogRow }) {
  if (r.reply.kind === "replied") {
    return (
      <span className="inline-flex flex-col items-end text-right lg:items-start lg:text-left">
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          {fmtMin(r.reply.minutes)}
        </span>
        {r.reply.by && <span className="mt-0.5 text-xs text-zinc-500">by {r.reply.by}</span>}
      </span>
    );
  }
  if (r.reply.kind === "waiting") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
        No reply yet
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      Not tracked
    </span>
  );
}

function Counted({ r }: { r: LogRow }) {
  const returning = r.firstContactAt ? (
    <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      Returning · first {dateFmt.format(r.firstContactAt)}
    </span>
  ) : null;
  if (r.counted.kind === "live") {
    return (
      <span>
        <Link
          href={`/tiktok-live/${r.counted.liveId}`}
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          @{r.counted.handle} · {timeFmt.format(r.counted.startedAt)}
        </Link>
        {returning}
      </span>
    );
  }
  const why =
    r.counted.reason === "no-handle"
      ? "Not counted — no TikTok handle linked to this number"
      : r.counted.reason === "returning"
        ? "Not counted — returning customer"
        : "Not counted — not during a live (or 3 h after)";
  return (
    <span className="text-zinc-500">
      {why}
      {returning}
    </span>
  );
}
