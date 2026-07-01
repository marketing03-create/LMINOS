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
];

const selectCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100";

export function UsersEditor({ rows, teams }: { rows: UserRow[]; teams: Team[] }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-hidden">
      <table className="w-full text-sm">
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
            <Row key={r.id} r={r} teams={teams} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ r, teams }: { r: UserRow; teams: Team[] }) {
  const router = useRouter();
  const [role, setRole] = useState(r.role);
  const [teamId, setTeamId] = useState(r.teamId ?? "");
  const [active, setActive] = useState(r.isActive);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = role !== r.role || teamId !== (r.teamId ?? "") || active !== r.isActive;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${r.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, teamId: teamId || null, isActive: active }),
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

  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-900">
      <td className="px-4 py-2.5 font-mono text-xs">{r.email}</td>
      <td className="px-4 py-2.5">{r.fullName ?? "—"}</td>
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
      <td className="px-4 py-2.5 text-right">
        {err && <span className="text-xs text-red-500 mr-2">{err}</span>}
        {dirty && (
          <button
            onClick={save}
            disabled={busy}
            className="rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-3 py-1 text-xs font-medium disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
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
