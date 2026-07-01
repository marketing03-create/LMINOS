"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type TeamRow = {
  id: string;
  name: string;
  loanTypes: string[];
  isActive: boolean;
  agentCount: number;
};

export function TeamsEditor({ rows }: { rows: TeamRow[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = await res.json();
      if (!json.ok) setErr(json.error ?? "Failed");
      else {
        setNewName("");
        router.refresh();
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={addTeam} className="flex items-center gap-2 mb-5">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New team name…"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          + Add team
        </button>
        {err && <span className="text-xs text-red-500">{err}</span>}
      </form>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>Name</Th>
              <Th>Loan types</Th>
              <Th className="text-right">Agents</Th>
              <Th>Active</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                  No teams yet — add one above.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Row({ r }: { r: TeamRow }) {
  const router = useRouter();
  const [name, setName] = useState(r.name);
  const [active, setActive] = useState(r.isActive);
  const [busy, setBusy] = useState(false);
  const dirty = name !== r.name || active !== r.isActive;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/teams/${r.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, isActive: active }),
      });
      if ((await res.json()).ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-900">
      <td className="px-4 py-2.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm w-48"
        />
      </td>
      <td className="px-4 py-2.5 text-xs font-mono">
        {r.loanTypes.length ? r.loanTypes.join(", ") : "—"}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">{r.agentCount}</td>
      <td className="px-4 py-2.5">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td className="px-4 py-2.5 text-right">
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

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-2.5 font-medium text-xs uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}
