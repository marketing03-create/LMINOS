"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type TikTokRow = {
  id: string;
  handle: string;
  displayName: string;
  isActive: boolean;
  leadKeywords: string[] | null;
  lastSyncedAt: string | Date | null;
  sessions: number;
};

export function TikTokAdmin({ rows }: { rows: TikTokRow[] }) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setError(json.error ?? `Request failed (${res.status}).`);
        return false;
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call("/api/tiktok-accounts", "POST", { handle, displayName });
    if (ok) {
      setHandle("");
      setDisplayName("");
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      <form
        onSubmit={add}
        className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4 flex flex-wrap items-end gap-3"
      >
        <label className="block">
          <div className="text-xs font-medium mb-1">TikTok @handle</div>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@yourbrand"
            className={inputCls}
            required
          />
        </label>
        <label className="block">
          <div className="text-xs font-medium mb-1">
            Display name <span className="text-zinc-400">(optional)</span>
          </div>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your Brand"
            className={inputCls}
          />
        </label>
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? "Saving…" : "+ Track handle"}
        </button>
      </form>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>Handle</Th>
              <Th>Name</Th>
              <Th>Lead keywords</Th>
              <Th className="text-right">Sessions</Th>
              <Th>Last synced</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                  No handles tracked yet. Add one above.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-900">
                <Td className="font-mono">@{r.handle}</Td>
                <Td>{r.displayName}</Td>
                <Td>
                  <KeywordsCell
                    initial={(r.leadKeywords ?? []).join(", ")}
                    busy={busy}
                    onSave={(val) =>
                      call(`/api/tiktok-accounts/${r.id}`, "PATCH", { leadKeywords: val })
                    }
                  />
                </Td>
                <Td className="text-right tabular-nums">{r.sessions}</Td>
                <Td className="text-xs text-zinc-500">
                  {r.lastSyncedAt
                    ? new Date(r.lastSyncedAt).toLocaleString("en-MY", { hour12: false })
                    : "—"}
                </Td>
                <Td>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      r.isActive
                        ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {r.isActive ? "active" : "paused"}
                  </span>
                </Td>
                <Td className="text-right">
                  <div className="inline-flex gap-2 justify-end">
                    <button
                      onClick={() =>
                        call(`/api/tiktok-accounts/${r.id}`, "PATCH", {
                          isActive: !r.isActive,
                        })
                      }
                      disabled={busy}
                      className={btnSmall}
                    >
                      {r.isActive ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Stop tracking @${r.handle} and delete its sessions?`))
                          call(`/api/tiktok-accounts/${r.id}`, "DELETE");
                      }}
                      disabled={busy}
                      className={btnSmall}
                    >
                      Delete
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KeywordsCell({
  initial,
  busy,
  onSave,
}: {
  initial: string;
  busy: boolean;
  onSave: (val: string) => void;
}) {
  const [val, setVal] = useState(initial);
  const dirty = val.trim() !== initial.trim();
  return (
    <div className="flex items-center gap-1">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="lend, loan, pinjaman"
        className="w-44 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
      />
      {dirty && (
        <button onClick={() => onSave(val)} disabled={busy} className={btnSmall}>
          Save
        </button>
      )}
    </div>
  );
}

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";
const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
const btnSmall =
  "inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2.5 py-1 text-xs disabled:opacity-50";

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2.5 font-medium text-xs uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
}
