"use client";

import Link from "next/link";
import {
  HandleCard,
  KeywordsCell,
  btnSmall,
  useHandleActions,
  type StreamerOption,
  type TikTokRow,
} from "../tiktok/tiktok-admin";
import { UsersEditor, type PersonColumns, type UserRow } from "./users-editor";

/**
 * People and their TikTok handles in ONE table. A streamer's handle sits on
 * their own row — the old second table repeated every streamer (its Streamer
 * column) and every handle (a Name column that was just the handle again).
 * Handles nobody is assigned to follow everyone, as "Not assigned" rows.
 *
 * Person cells (email, name, role, active, Telegram, Save/Remove) still belong
 * to UsersEditor; this adds the handle columns: Handle, Lead keywords, Lives,
 * Tracking. Every write is the same request the two tables made before.
 */

const HANDLE_COLS = 4;
const cell = "px-4 py-2.5 align-top";

export function PeopleTable({
  users,
  handles,
  streamers,
  currentUserId,
}: {
  users: UserRow[];
  handles: TikTokRow[];
  streamers: StreamerOption[];
  currentUserId: string | null;
}) {
  const { busyId, error, patch, remove } = useHandleActions();
  const byUser = new Map<string, TikTokRow[]>();
  for (const h of handles) {
    if (!h.assignedStreamerId) continue;
    byUser.set(h.assignedStreamerId, [...(byUser.get(h.assignedStreamerId) ?? []), h]);
  }
  const userIds = new Set(users.map((u) => u.id));
  // Unassigned, or assigned to someone no longer in the list.
  const orphans = handles.filter((h) => !h.assignedStreamerId || !userIds.has(h.assignedStreamerId));
  const assignable = orphans;

  const handleTds = (h: TikTokRow) => (
    <>
      <td className={`${cell} font-mono whitespace-nowrap`}>
        <Link href={`/admin/tiktok/${h.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
          @{h.handle}
        </Link>
      </td>
      <td className={cell}>
        <KeywordsCell
          initial={(h.leadKeywords ?? []).join(", ")}
          busy={busyId === h.id}
          onSave={(val) => patch(h.id, { leadKeywords: val })}
        />
      </td>
      <td className={`${cell} text-right tabular-nums`}>{h.sessions}</td>
      <td className={`${cell} whitespace-nowrap`}>
        <span
          className={`mr-2 rounded-full px-2 py-0.5 text-xs ${
            h.isActive
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
          }`}
        >
          {h.isActive ? "active" : "paused"}
        </span>
        <span className="inline-flex gap-1.5">
          <button
            onClick={() => patch(h.id, { isActive: !h.isActive })}
            disabled={busyId === h.id}
            className={btnSmall}
          >
            {h.isActive ? "Pause" : "Resume"}
          </button>
          {h.assignedStreamerId && (
            <button
              onClick={() => patch(h.id, { assignedStreamerId: null })}
              disabled={busyId === h.id}
              className={btnSmall}
            >
              Unassign
            </button>
          )}
          <button
            onClick={() => {
              if (confirm(`Stop tracking @${h.handle} and delete its sessions?`)) void remove(h.id);
            }}
            disabled={busyId === h.id}
            className={btnSmall}
          >
            Delete
          </button>
        </span>
      </td>
    </>
  );

  const noHandleTds = (u: UserRow) => (
    <>
      <td className={cell}>
        {u.role === "live_streamer" && assignable.length > 0 ? (
          <select
            value=""
            disabled={busyId !== null}
            onChange={(e) => e.target.value && void patch(e.target.value, { assignedStreamerId: u.id })}
            className="w-40 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">+ Assign handle</option>
            {assignable.map((h) => (
              <option key={h.id} value={h.id}>
                @{h.handle}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className={cell} />
      <td className={cell} />
      <td className={cell} />
    </>
  );

  const columns: PersonColumns = {
    count: HANDLE_COLS,
    headers: (
      <>
        <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider">TikTok handle</th>
        <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider">Lead keywords</th>
        <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider">Lives</th>
        <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider">Tracking</th>
      </>
    ),
    lines: (u) => {
      const mine = byUser.get(u.id) ?? [];
      return mine.length > 0 ? mine.map((h) => handleTds(h)) : [noHandleTds(u)];
    },
    trailingRows: orphans.map((h) => (
      <tr key={h.id} className="border-t border-zinc-100 bg-zinc-50/60 dark:border-zinc-900 dark:bg-zinc-900/30">
        <td colSpan={5} className={cell}>
          <span className="mr-3 text-xs text-zinc-500">Not assigned</span>
          <select
            value=""
            disabled={busyId === h.id || streamers.length === 0}
            onChange={(e) => e.target.value && void patch(h.id, { assignedStreamerId: e.target.value })}
            className="w-48 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">Assign to…</option>
            {streamers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName ? `${s.fullName} (${s.email})` : s.email}
              </option>
            ))}
          </select>
        </td>
        {handleTds(h)}
        <td className={cell} />
      </tr>
    )),
    cardAfter: (u) => {
      const mine = byUser.get(u.id) ?? [];
      if (mine.length === 0) return null;
      return mine.map((h) => (
        <HandleCard
          key={h.id}
          row={h}
          streamers={streamers}
          busy={busyId === h.id}
          showStreamer={false}
          onPatch={(body) => patch(h.id, body)}
          onDelete={() => remove(h.id)}
        />
      ));
    },
    cardTrailing:
      orphans.length > 0 ? (
        <div className="space-y-2 pt-2">
          <h3 className="px-1 text-sm font-semibold text-zinc-500">Handles not assigned</h3>
          {orphans.map((h) => (
            <HandleCard
              key={h.id}
              row={h}
              streamers={streamers}
              busy={busyId === h.id}
              onPatch={(body) => patch(h.id, body)}
              onDelete={() => remove(h.id)}
            />
          ))}
        </div>
      ) : null,
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}
      <UsersEditor rows={users} currentUserId={currentUserId} columns={columns} />
    </div>
  );
}
