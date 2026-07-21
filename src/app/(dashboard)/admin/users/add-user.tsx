"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Least-privilege first (matches the signup trigger's default). The admin picks
// up from here; role is editable anytime in the table below.
const ROLES = [
  "viewer",
  "live_streamer",
  "sales_agent",
  "team_lead",
  "marketing_manager",
  "hq_admin",
];

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100";

export function AddUser({ teams }: { teams: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("viewer");
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // After a successful add: the ready-to-send invite message (+ copied flag).
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setEmail("");
    setFullName("");
    setRole("viewer");
    setTeamId("");
    setErr(null);
  }

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim() || null,
          role,
          teamId: teamId || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setErr(json.error ?? `Failed (${res.status}).`);
        return;
      }
      // Build the copy-paste invite (same origin the admin is on).
      const origin =
        typeof window !== "undefined" ? window.location.origin : "https://lmiros.vercel.app";
      setInvite(
        `You've been added to LMIROS. Open ${origin} and sign in with Google using ${email.trim()}.`
      );
      setCopied(false);
      router.refresh(); // show the new user in the table
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — the message is still on screen to copy by hand
    }
  }

  // Success state: show the invite to send.
  if (invite) {
    return (
      <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
        <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          ✅ User added
        </div>
        <p className="text-xs text-zinc-500">
          Send them this (WhatsApp, Telegram, email). They just open the link and
          sign in with Google — no password, nothing else to set up.
        </p>
        <div className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-3 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
          {invite}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={copy}
            className="inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium"
          >
            {copied ? "Copied ✓" : "Copy message"}
          </button>
          <button
            onClick={() => {
              setInvite(null);
              reset();
            }}
            className="text-sm text-zinc-500 hover:underline"
          >
            Add another
          </button>
          <button
            onClick={() => {
              setInvite(null);
              setOpen(false);
              reset();
            }}
            className="text-sm text-zinc-500 hover:underline"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-3 py-2 text-sm font-medium"
      >
        + Add user
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        <label className="block flex-1 min-w-[220px]">
          <div className="text-xs font-medium mb-1">Email (their Google login)</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@enquirymail.com"
            className={inputCls + " w-full"}
          />
        </label>
        <label className="block flex-1 min-w-[160px]">
          <div className="text-xs font-medium mb-1">Name (optional)</div>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={120}
            className={inputCls + " w-full"}
          />
        </label>
        <label className="block">
          <div className="text-xs font-medium mb-1">Role</div>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            {ROLES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs font-medium mb-1">Team</div>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inputCls}>
            <option value="">— none —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {err && <div className="text-xs text-red-600 dark:text-red-400">{err}</div>}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={create}
          disabled={busy || !email.trim()}
          className="inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Adding…" : "Create user"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            reset();
          }}
          disabled={busy}
          className="text-sm text-zinc-500 hover:underline"
        >
          Cancel
        </button>
        <span className="text-xs text-zinc-400">
          No email is sent. After adding, you&apos;ll get a message to send them.
        </span>
      </div>
    </div>
  );
}
