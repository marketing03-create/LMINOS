"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Section, StatusPill } from "./ui";
import { TikTokMark } from "@/components/channel-mark";

export type DmChannelView = {
  id: string;
  connectionName: string;
  label: string | null;
  channelId: string;
  accountId: string | null;
  lastSeenAgo: string;
  dmsToday: number;
};

/**
 * TikTok DMs through WATI: each TikTok account WATI has connected (it shows up
 * here with its first DM) and the TT Stars handle its DMs count for. Linked
 * automatically when WATI names the account like a handle; otherwise pick it.
 */
export function TikTokDms({
  channels,
  handles,
}: {
  channels: DmChannelView[];
  handles: { id: string; handle: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function link(id: string, accountId: string) {
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch("/api/admin/wati/tiktok-channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, accountId: accountId || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) setErr(json.error ?? `Couldn't save (${res.status}).`);
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const linked = channels.filter((c) => c.accountId).length;
  return (
    <Section id="tiktok-dms" title="TikTok DMs" meta={channels.length ? `${linked} of ${channels.length} linked` : undefined}>
      {channels.length === 0 ? (
        <Panel className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No TikTok DM yet. Connect TikTok in WATI → Channels and turn on that account&apos;s webhook for it.
        </Panel>
      ) : (
        <Panel>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {channels.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <TikTokMark />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.label ? `@${c.label}` : "TikTok account"}</div>
                    <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {c.connectionName} · last DM {c.lastSeenAgo}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={c.dmsToday > 0 ? "ok" : "off"}>{c.dmsToday} today</StatusPill>
                  <label className="sr-only" htmlFor={`dm-${c.id}`}>
                    Handle for {c.label ?? "this TikTok account"}
                  </label>
                  <select
                    id={`dm-${c.id}`}
                    value={c.accountId ?? ""}
                    disabled={busy === c.id}
                    onChange={(e) => link(c.id, e.target.value)}
                    className={`h-11 min-w-0 flex-1 rounded-lg border bg-white px-3 text-base lg:h-9 lg:w-56 lg:flex-none lg:text-sm dark:bg-zinc-950 ${
                      c.accountId
                        ? "border-zinc-300 dark:border-zinc-700"
                        : "border-amber-400 text-amber-800 dark:border-amber-700 dark:text-amber-300"
                    }`}
                  >
                    <option value="">Not linked</option>
                    {handles.map((h) => (
                      <option key={h.id} value={h.id}>
                        @{h.handle}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
          {err && <p className="border-t border-zinc-100 px-4 py-2 text-sm text-red-600 dark:border-zinc-800">{err}</p>}
        </Panel>
      )}
    </Section>
  );
}
