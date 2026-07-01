"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Step = "details" | "authorize" | "done";
type WebsiteOption = { id: string; slug: string; name: string };

const NEW_WEBSITE = "__new__";

export function AddAccountForm({ websites = [] }: { websites?: WebsiteOption[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // step 1
  const [customerId, setCustomerId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [websiteId, setWebsiteId] = useState(""); // "" = none, NEW_WEBSITE, or an id
  const [newWebsiteSlug, setNewWebsiteSlug] = useState("");
  const [owningEmail, setOwningEmail] = useState("");

  // carried between steps
  const [accountId, setAccountId] = useState("");
  const [consentUrl, setConsentUrl] = useState("");
  const [code, setCode] = useState("");
  const [rowsUpserted, setRowsUpserted] = useState(0);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ad-accounts/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId,
          displayName,
          owningEmail,
          // Either an existing website id, or a new slug to create.
          websiteId: websiteId && websiteId !== NEW_WEBSITE ? websiteId : undefined,
          website: websiteId === NEW_WEBSITE ? newWebsiteSlug : undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Failed to create account.");
        return;
      }
      setAccountId(json.accountId);
      setConsentUrl(json.consentUrl);
      setStep("authorize");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The user often pastes the whole localhost URL — pull out the code.
      let c = code.trim();
      const m = c.match(/[?&]code=([^&]+)/);
      if (m) c = decodeURIComponent(m[1]);

      const res = await fetch(`/api/ad-accounts/${accountId}/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Failed to connect.");
        return;
      }
      setRowsUpserted(json.rowsUpserted ?? 0);
      setStep("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-6 max-w-2xl">
      <Steps step={step} />

      {error && (
        <div className="mb-5 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {step === "details" && (
        <form onSubmit={createAccount} className="space-y-4">
          <Field label="Customer ID" hint="The 10-digit Google Ads account number (top-right in Google Ads).">
            <input
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="123-456-7890"
              className={inputCls}
              required
            />
          </Field>
          <Field label="Account name" hint="Shown in LMIROS, e.g. “Apply KL Loan”.">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Apply KL Loan"
              className={inputCls}
              required
            />
          </Field>
          <Field label="Website" hint="Which website this account drives traffic to. Leads, spend & revenue join by the website's slug (= Zoho's “Website” value), so ROAS stays continuous if you later replace this account.">
            <select
              value={websiteId}
              onChange={(e) => setWebsiteId(e.target.value)}
              className={inputCls}
            >
              <option value="">— none / link later —</option>
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.slug})
                </option>
              ))}
              <option value={NEW_WEBSITE}>+ New website…</option>
            </select>
          </Field>
          {websiteId === NEW_WEBSITE && (
            <Field label="New website slug" hint="Must match the Zoho “Website” value for this site's leads, e.g. apply_kl_loan.">
              <input
                value={newWebsiteSlug}
                onChange={(e) => setNewWebsiteSlug(e.target.value)}
                placeholder="apply_kl_loan"
                className={inputCls}
                required
              />
            </Field>
          )}
          <Field label="Owning Gmail (recommended)" hint="The Google account that owns this ad account. Pre-selects it on the sign-in screen so you avoid the multi-account error.">
            <input
              type="email"
              value={owningEmail}
              onChange={(e) => setOwningEmail(e.target.value)}
              placeholder="admin@enquirymail.com"
              className={inputCls}
            />
          </Field>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "Creating…" : "Create & continue →"}
          </button>
        </form>
      )}

      {step === "authorize" && (
        <div className="space-y-4">
          <ol className="text-sm text-zinc-600 dark:text-zinc-300 space-y-2 list-decimal list-inside">
            <li>
              Open the Google sign-in page and{" "}
              <b>sign in as the Gmail that owns this account</b>:
            </li>
          </ol>
          <a
            href={consentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium"
          >
            Open Google sign-in ↗
          </a>
          <ol
            start={2}
            className="text-sm text-zinc-600 dark:text-zinc-300 space-y-2 list-decimal list-inside"
          >
            <li>Click <b>Allow</b>. You'll land on a “This site can't be reached” page — that's expected.</li>
            <li>Copy the whole address-bar URL (or just the <code>code=…</code> value) and paste it below.</li>
          </ol>
          <form onSubmit={connect} className="space-y-4">
            <Field label="Pasted code or URL">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="http://localhost/?code=4/0A…   (or just the code)"
                className={inputCls}
                required
              />
            </Field>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={btnPrimary}>
                {busy ? "Connecting & syncing…" : "Connect & sync"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("details");
                  setError(null);
                }}
                className={btnGhost}
              >
                Back
              </button>
            </div>
          </form>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4">
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
            ✓ Connected and synced — pulled <b>{rowsUpserted}</b> day-rows of metrics.
          </div>
          <div className="flex gap-2">
            <Link href={`/admin/ad-accounts/${accountId}`} className={btnPrimary}>
              View account →
            </Link>
            <Link href="/admin/ad-accounts" className={btnGhost}>
              All ad accounts
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";
const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
const btnGhost =
  "inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 px-4 py-2 text-sm";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium mb-1">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </label>
  );
}

function Steps({ step }: { step: Step }) {
  const items: [Step, string][] = [
    ["details", "1 · Details"],
    ["authorize", "2 · Authorize"],
    ["done", "3 · Done"],
  ];
  const idx = items.findIndex((i) => i[0] === step);
  return (
    <div className="flex gap-2 mb-6 text-xs">
      {items.map(([k, label], i) => (
        <span
          key={k}
          className={`px-2.5 py-1 rounded-full ${
            i <= idx
              ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
              : "bg-zinc-100 dark:bg-zinc-900 text-zinc-500"
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
