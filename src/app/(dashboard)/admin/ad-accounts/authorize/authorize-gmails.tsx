"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type GmailGroup = { email: string; total: number; authorized: number };
export type AttentionAccount = {
  id: string;
  displayName: string;
  externalAccountId: string;
  owningEmail: string | null;
  hasToken: boolean;
  lastSyncedAt: string | null;
};

export function AuthorizeGmails({
  groups,
  attention,
}: {
  groups: GmailGroup[];
  attention: AttentionAccount[];
}) {
  return (
    <div className="space-y-6">
      {groups.length > 0 && (
        <div className="space-y-3">
          {groups.map((g) => (
            <GmailRow key={g.email} group={g} />
          ))}
        </div>
      )}

      {attention.length > 0 && <AttentionSection accounts={attention} />}

      {groups.length === 0 && attention.length === 0 && (
        <p className="text-sm text-zinc-500">
          No Google accounts have an <code>owning_gmail</code> set yet. Bulk-import
          accounts with an <code>owning_gmail</code> column first, then come back.
        </p>
      )}
    </div>
  );
}

/** Accounts that need attention: no Gmail set, or not pulling data. */
function AttentionSection({ accounts }: { accounts: AttentionAccount[] }) {
  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-zinc-500">
        Needs attention · {accounts.length}
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        These accounts have no Gmail set, or aren&apos;t pulling data — usually
        because they&apos;re filed under the <b>wrong Gmail</b> (Google blocks it
        with a &ldquo;no permission&rdquo; error). Enter the Gmail that can
        actually open the account in Google Ads. If that Gmail is already
        authorized above, it connects instantly — no new sign-in.
      </p>
      <div className="space-y-3">
        {accounts.map((a) => (
          <AttentionRow key={a.id} account={a} />
        ))}
      </div>
    </div>
  );
}

function AttentionRow({ account }: { account: AttentionAccount }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const notPulling = !account.lastSyncedAt;

  async function save() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/ad-accounts/${account.id}/owning-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Failed (${res.status}).`);
        return;
      }
      setDone(
        json.copiedToken
          ? `Connected with ${email.trim()}. Now click Sync Google Ads now.`
          : json.needsSignIn
            ? `Saved. Now find ${email.trim()} above and click Authorize (one sign-in).`
            : "Gmail updated."
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">{account.displayName}</div>
          <div className="text-xs text-zinc-500 font-mono">{account.externalAccountId}</div>
          <div className="text-[11px] text-zinc-400 mt-0.5">
            Current Gmail: {account.owningEmail ?? "none set"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              notPulling
                ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                : "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
            }`}
          >
            {notPulling ? "not pulling data" : "no Gmail label"}
          </span>
          <span className="text-[11px] text-zinc-400">
            {account.lastSyncedAt
              ? `synced ${new Date(account.lastSyncedAt).toLocaleDateString("en-MY")}`
              : "never synced"}
          </span>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-800 dark:text-red-300">
          {error}
        </div>
      )}
      {done ? (
        <div className="mt-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
          ✓ {done}
        </div>
      ) : (
        <div className="mt-3 flex gap-2 flex-wrap">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Gmail that can open this account (e.g. marketing.04@enquirymail.com)"
            className="flex-1 min-w-[260px] rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
          <button onClick={save} disabled={busy || !email.trim()} className={btn}>
            {busy ? "Saving…" : "Set & connect"}
          </button>
        </div>
      )}
    </div>
  );
}

function GmailRow({ group }: { group: GmailGroup }) {
  const router = useRouter();
  const fullyDone = group.total > 0 && group.authorized >= group.total;
  const [step, setStep] = useState<"idle" | "code" | "done">(fullyDone ? "done" : "idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState(0);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ad-accounts/authorize-gmail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: group.email }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Failed to start.");
        return;
      }
      window.open(json.consentUrl, "_blank", "noreferrer");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      let c = code.trim();
      const m = c.match(/[?&]code=([^&]+)/);
      if (m) c = decodeURIComponent(m[1]);
      const res = await fetch("/api/ad-accounts/authorize-gmail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: group.email, code: c }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Failed to authorize.");
        return;
      }
      setApplied(json.applied ?? 0);
      setStep("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-mono text-sm">{group.email}</div>
          <div className="text-xs text-zinc-500">
            {group.authorized}/{group.total} accounts authorized
          </div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            fullyDone
              ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
          }`}
        >
          {fullyDone ? "authorized" : "needs sign-in"}
        </span>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {step === "idle" && (
        <button onClick={start} disabled={busy} className={`${btn} mt-3`}>
          {busy ? "Opening…" : `Authorize this Gmail (${group.total} accounts)`}
        </button>
      )}

      {step === "code" && (
        <div className="mt-3 space-y-2">
          <ol className="text-xs text-zinc-600 dark:text-zinc-300 list-decimal list-inside space-y-1">
            <li>
              In the opened tab, <b>sign in as {group.email}</b> and click{" "}
              <b>Allow</b>.
            </li>
            <li>
              You&apos;ll land on a &quot;can&apos;t be reached&quot; page — copy
              that whole address-bar URL (or the <code>code=…</code> value).
            </li>
          </ol>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="paste code or URL here"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={finish} disabled={busy || !code.trim()} className={btn}>
              {busy ? "Applying…" : `Apply to all ${group.total} accounts`}
            </button>
            <button onClick={() => setStep("idle")} className={btnGhost}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="mt-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
          ✓ Authorized{applied ? ` ${applied} account(s)` : ""}. Then click{" "}
          <b>Sync Google Ads now</b> on the Ad accounts page to pull their metrics.
        </div>
      )}
    </div>
  );
}

const btn =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50";
const btnGhost =
  "inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 px-3 py-1.5 text-sm";
