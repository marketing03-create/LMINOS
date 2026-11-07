import Link from "next/link";
import type { LogRow } from "@/lib/wati/log";

/**
 * Pieces shared by the WhatsApp log's two views (Chats, First contact):
 * date formatters, day grouping, the CS/Customer message labels, the Chat
 * button, the CS reply badge and the "From live" cell.
 */

export const timeFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
export const dateFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  year: "numeric",
});
export const dayFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "UTC", // a `day` param is already a Malaysia date
  weekday: "short",
  day: "numeric",
  month: "short",
});

export const clockFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const MYT_MS = 8 * 60 * 60 * 1000; // Malaysia is UTC+8, no DST
export const mytDay = (d: Date) => new Date(d.getTime() + MYT_MS).toISOString().slice(0, 10);

/** Rows split by Malaysia day, newest first (rows already arrive newest first). */
export function byDay(rows: LogRow[]): { day: string; rows: LogRow[] }[] {
  const groups: { day: string; rows: LogRow[] }[] = [];
  for (const r of rows) {
    const day = mytDay(r.firstMessageAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.rows.push(r);
    else groups.push({ day, rows: [r] });
  }
  return groups;
}

export function dayLabel(day: string, now = new Date()): string {
  if (day === mytDay(now)) return "Today";
  if (day === mytDay(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return dayFmt.format(new Date(`${day}T00:00:00Z`));
}

export function fmtMin(m: number): string {
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}


/** Today's messages show the time; older ones the date too. */
export function when(at: Date): string {
  return mytDay(at) === mytDay(new Date()) ? clockFmt.format(at) : timeFmt.format(at);
}

/** Small label above a message: who sent it, and (for the newest) when. */
export function Eyebrow({ from, at }: { from: "customer" | "cs"; at?: Date }) {
  return (
    <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
      <span className={from === "cs" ? "text-emerald-600 dark:text-emerald-400" : "text-sky-600 dark:text-sky-400"}>
        {from === "cs" ? "CS" : "Customer"}
      </span>
      {at && <span className="font-normal normal-case tracking-normal text-zinc-500">· {when(at)}</span>}
    </span>
  );
}

/** Phone card: one message with what it is (First / Newest) and who sent it. */
export function MessageBlock({
  label,
  from,
  at,
  text,
}: {
  label: string;
  from: "customer" | "cs";
  at?: Date;
  text: string | null;
}) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-950">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span className={from === "cs" ? "text-emerald-600 dark:text-emerald-400" : "text-sky-600 dark:text-sky-400"}>
          {from === "cs" ? "CS" : "Customer"}
        </span>
        {at && <span className="font-normal normal-case tracking-normal">· {when(at)}</span>}
      </span>
      <p className="mt-0.5 line-clamp-2 text-zinc-700 dark:text-zinc-300">{text ?? "—"}</p>
    </div>
  );
}

/** 60123456789 → +60 12-345 6789 (Malaysian mobiles); anything else as +digits. */
export function fmtPhone(d: string): string {
  const m = /^60(1\d)(\d{3,4})(\d{4})$/.exec(d);
  return m ? `+60 ${m[1]}-${m[2]} ${m[3]}` : `+${d}`;
}

/** The customer's full number — selectable, and findable with the browser's search. */
export function PhoneNumber({ phone }: { phone: string }) {
  return <span className="select-all font-mono tabular-nums">{fmtPhone(phone)}</span>;
}

/** Opens this customer's chat in WATI Team Inbox, in a new tab. */
export function ChatLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-emerald-300 px-2 text-xs font-medium text-emerald-700 active:bg-emerald-50 lg:hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:active:bg-emerald-950/40 lg:dark:hover:bg-emerald-950/40"
    >
      Chat
      <span aria-hidden="true">↗</span>
      <span className="sr-only">(opens WATI in a new tab)</span>
    </a>
  );
}

export function Reply({ r }: { r: LogRow }) {
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

export function Counted({ r }: { r: LogRow }) {
  // Their real first message (WATI history) is earlier than the one TT Stars
  // first saw. Only an earlier DAY is a return; the same day just means they
  // wrote before TT Stars heard them (e.g. before the account was connected).
  const sameDay =
    r.firstContactAt && dateFmt.format(r.firstContactAt) === dateFmt.format(r.firstMessageAt);
  const returning = r.firstContactAt ? (
    <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {sameDay
        ? `First wrote ${timeFmt.format(r.firstContactAt)}`
        : `Returning · since ${dateFmt.format(r.firstContactAt)}`}
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
  // A returning customer's badge already says so — don't say it twice.
  if (r.counted.reason === "returning" && returning) {
    return <span className="text-zinc-500">{returning}</span>;
  }
  const why =
    r.counted.reason === "no-handle"
      ? "No TikTok handle linked"
      : r.counted.reason === "returning"
        ? "Returning customer"
        : "Outside live hours";
  return (
    <span className="text-zinc-500">
      {why}
      {returning}
    </span>
  );
}
