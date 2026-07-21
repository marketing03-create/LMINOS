"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type UserRow = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  teamId: string | null;
  isActive: boolean;
  dailyCapacity: number;
  telegramPaired: boolean;
};
type Team = { id: string; name: string };

const ROLES = [
  "hq_admin",
  "marketing_manager",
  "team_lead",
  "sales_agent",
  "viewer",
  "live_streamer",
];

const selectCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100";

export function UsersEditor({
  rows,
  teams,
  currentUserId,
}: {
  rows: UserRow[];
  teams: Team[];
  currentUserId: string | null;
}) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
          <tr>
            <Th>Email</Th>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th>Team</Th>
            <Th>Active</Th>
            <Th>Telegram</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                No users yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <Row key={r.id} r={r} teams={teams} isSelf={r.id === currentUserId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ r, teams, isSelf }: { r: UserRow; teams: Team[]; isSelf: boolean }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(r.fullName ?? "");
  const [role, setRole] = useState(r.role);
  const [teamId, setTeamId] = useState(r.teamId ?? "");
  const [active, setActive] = useState(r.isActive);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const nameOrig = r.fullName ?? "";
  const dirty =
    fullName.trim() !== nameOrig ||
    role !== r.role ||
    teamId !== (r.teamId ?? "") ||
    active !== r.isActive;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${r.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          role,
          teamId: teamId || null,
          isActive: active,
        }),
      });
      const json = await res.json();
      if (!json.ok) setErr(json.error ?? "Failed");
      else router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !confirm(
        `Remove ${r.email} from LMIROS?\n\nThey lose all access immediately. Any sales or leads credited to them become unassigned (the records are kept). A real person could sign in again later as a fresh no-access account.`
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${r.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!json.ok) setErr(json.error ?? "Failed");
      else router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-900">
      <td className="px-4 py-2.5 font-mono text-xs">{r.email}</td>
      <td className="px-4 py-2.5">
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="—"
          maxLength={120}
          className="w-full max-w-[220px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </td>
      <td className="px-4 py-2.5">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}>
          {ROLES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5">
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={selectCls}>
          <option value="">— none —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td className="px-4 py-2.5">{r.telegramPaired ? "✓" : "—"}</td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {err && <span className="text-xs text-red-500 mr-2">{err}</span>}
        {dirty && (
          <button
            onClick={save}
            disabled={busy}
            className="rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-3 py-1 text-xs font-medium disabled:opacity-50 mr-2"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        )}
        {isSelf ? (
          <span className="text-xs text-zinc-400">you</span>
        ) : (
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-md border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 px-3 py-1 text-xs font-medium disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </td>
    </tr>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{children}</th>
  );
}
