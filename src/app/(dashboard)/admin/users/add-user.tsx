"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

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

/**
 * Same six values, spelled for a human. Only the phone gets these: the desktop
 * <select> keeps printing the raw enum so its pixels stay exactly where they
 * are, and both write the identical string.
 */
const ROLE_LABEL: Record<string, string> = {
  viewer: "Viewer",
  live_streamer: "Live streamer",
  sales_agent: "Sales agent",
  team_lead: "Team lead",
  marketing_manager: "Marketing manager",
  hq_admin: "HQ admin",
};

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100";

// 16px and 48px on a phone, today's 14px and ~34px from `lg` up. iOS zooms the
// whole viewport on any input under 16px, which on this form means the page
// jumps as the admin taps into Email — with the Create button sliding off the
// bottom of the zoomed view.
const fieldCls =
  inputCls +
  " w-full h-12 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:h-auto lg:text-sm";

const labelCls = "text-sm lg:text-xs font-medium mb-1";

// A text button is a 20px target with a hover-only underline — two things a
// thumb cannot use. 44px tall below `lg`, and the underline is always on there.
const linkBtnCls =
  "text-sm text-zinc-500 min-h-11 px-1 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded lg:min-h-0 lg:px-0 lg:no-underline lg:hover:underline";

const solidBtnCls =
  "inline-flex items-center justify-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 min-h-11 w-full text-base font-medium active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950 lg:min-h-0 lg:w-auto lg:justify-start lg:text-sm";

export function AddUser() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // After a successful add: the ready-to-send invite message (+ copied flag).
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Clipboard refused us — see `copy()`.
  const [copyFailed, setCopyFailed] = useState(false);
  const inviteRef = useRef<HTMLDivElement>(null);
  // The role field renders twice (phone labels / today's raw enum); each
  // rendering needs its own id so its own <label> can point at it.
  const roleMobileId = useId();
  const roleDesktopId = useId();

  function reset() {
    setEmail("");
    setFullName("");
    setRole("viewer");
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
        `You've been added to LMIROS.\n\n` +
          `1. Open ${origin}\n` +
          `2. Enter your email: ${email.trim()}\n` +
          `3. Tap "Email me a code"\n` +
          `4. Check your inbox and type the 6-digit code\n\n` +
          `Any email works — Outlook, Gmail, anything. No password needed.`
      );
      setCopied(false);
      setCopyFailed(false);
      router.refresh(); // show the new user in the table
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * The failure path matters more than the happy one here. `navigator.clipboard`
   * is undefined on a non-secure origin and refuses outright inside several
   * in-app webviews — which is exactly where this button gets pressed, because
   * the admin is already in WhatsApp when they send the invite. Swallowing that
   * silently left the button reading "Copy message" forever and the admin
   * pasting nothing. So on failure we select the text for them and say so.
   */
  async function copy() {
    if (!invite) return;
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(invite);
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
      const el = inviteRef.current;
      if (el && typeof window !== "undefined") {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  // Success state: show the invite to send.
  if (invite) {
    return (
      <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
        <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          ✅ User added
        </div>
        <p className="text-sm leading-relaxed text-zinc-500">Send them this message.</p>
        <div
          ref={inviteRef}
          className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-3 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap select-all lg:select-auto"
        >
          {invite}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={copy} className={solidBtnCls}>
            {copied ? "Copied ✓" : copyFailed ? "Select and copy" : "Copy message"}
          </button>
          <button
            onClick={() => {
              setInvite(null);
              setCopyFailed(false);
              reset();
            }}
            className={linkBtnCls}
          >
            Add another
          </button>
          <button
            onClick={() => {
              setInvite(null);
              setCopyFailed(false);
              setOpen(false);
              reset();
            }}
            className={linkBtnCls}
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
        className="inline-flex items-center justify-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-3 py-2 min-h-11 text-sm font-medium active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950 lg:min-h-0 lg:justify-start"
      >
        + Add user
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        <label className="block flex-1 min-w-[220px]">
          <div className={labelCls}>Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@enquirymail.com"
            className={fieldCls}
          />
        </label>
        <label className="block flex-1 min-w-[160px]">
          <div className={labelCls}>Name (optional)</div>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={120}
            className={fieldCls}
          />
        </label>
        <div className="block">
          {/* Two selects, one value: the readable one below `lg`, today's exact
              one from `lg` up. A single element cannot hold two option labels,
              and the desktop table is not allowed to shift.

              Two <label>s rather than one wrapping the pair: a wrapping label
              binds to its FIRST labelable descendant, which here is the
              `lg:hidden` phone select — so at `lg` the caption "Role" would
              point at a `display:none` control and clicking it would focus
              nothing, a regression on the exact rendering P5 protects. Each
              label is visible in exactly the breakpoint its own select is, and
              the box it occupies is byte-identical to today's <div>. */}
          <label htmlFor={roleMobileId} className={labelCls + " block lg:hidden"}>
            Role
          </label>
          <label htmlFor={roleDesktopId} className={labelCls + " hidden lg:block"}>
            Role
          </label>
          <select
            id={roleMobileId}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={fieldCls + " lg:hidden"}
          >
            {ROLES.map((x) => (
              <option key={x} value={x}>
                {ROLE_LABEL[x] ?? x}
              </option>
            ))}
          </select>
          <select
            id={roleDesktopId}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={inputCls + " hidden lg:inline-block"}
          >
            {ROLES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
      </div>

      {err && (
        <div className="text-sm leading-relaxed lg:text-xs lg:leading-[1rem] text-red-600 dark:text-red-400">
          {err}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={create} disabled={busy || !email.trim()} className={solidBtnCls + " disabled:opacity-50"}>
          {busy ? "Adding…" : "Create user"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            reset();
          }}
          disabled={busy}
          className={linkBtnCls}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
