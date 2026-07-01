"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Account = {
  id: string;
  displayName: string;
  website: string | null;
  owningEmail: string | null;
  isActive: boolean;
};

export function EditAccountForm({ account }: { account: Account }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(account.displayName);
  const [website, setWebsite] = useState(account.website ?? "");
  const [owningEmail, setOwningEmail] = useState(account.owningEmail ?? "");
  const [isActive, setIsActive] = useState(account.isActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/ad-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, website, owningEmail, isActive }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Failed (${res.status}).`);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-6 space-y-4 max-w-xl"
    >
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
          ✓ Saved.
        </div>
      )}

      <Field label="Account name">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} required />
      </Field>
      <Field label="Website slug" hint="The Zoho “Website” value for this account's leads (for per-website ROAS). Leave blank for none.">
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="dana_credit" className={inputCls} />
      </Field>
      <Field label="Owning Gmail" hint="The Google account that can read this ad account (used for bulk per-Gmail authorization).">
        <input type="email" value={owningEmail} onChange={(e) => setOwningEmail(e.target.value)} placeholder="owner@gmail.com" className={inputCls} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active (synced + shown in totals)
      </label>

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <Link href="/admin/ad-accounts" className={btnGhost}>
          Back
        </Link>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";
const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
const btnGhost =
  "inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 px-4 py-2 text-sm";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm font-medium mb-1">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </label>
  );
}
