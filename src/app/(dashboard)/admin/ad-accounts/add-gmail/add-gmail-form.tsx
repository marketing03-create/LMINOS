"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type DiscoveredAccount = {
  customerId: string;
  name: string;
  isManager: boolean;
  status: string;
  alreadyInLmiros: boolean;
};

type Step = "email" | "code" | "select" | "done";

export function AddGmailForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [encryptedToken, setEncryptedToken] = useState("");
  const [accounts, setAccounts] = useState<DiscoveredAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importResults, setImportResults] = useState<
    { customerId: string; displayName: string; action: string }[]
  >([]);

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/ad-accounts/discover-gmail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function startConsent() {
    setBusy(true);
    setError(null);
    try {
      const json = await call({ email: email.trim() });
      if (!json.ok) {
        setError(json.error ?? "Failed.");
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

  async function discover() {
    setBusy(true);
    setError(null);
    try {
      let c = code.trim();
      const m = c.match(/[?&]code=([^&]+)/);
      if (m) c = decodeURIComponent(m[1]);

      const json = await call({ email: email.trim(), code: c });
      if (!json.ok) {
        setError(json.error ?? "Failed to discover accounts.");
        return;
      }
      setEncryptedToken(json.encryptedToken);
      setAccounts(json.accounts ?? []);
      const newIds = new Set<string>();
      for (const a of json.accounts ?? []) {
        if (!a.alreadyInLmiros && !a.isManager && a.status === "ENABLED") {
          newIds.add(a.customerId);
        }
      }
      setSelected(newIds);
      setStep("select");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function importSelected() {
    setBusy(true);
    setError(null);
    try {
      const toImport = accounts
        .filter((a) => selected.has(a.customerId))
        .map((a) => ({ customerId: a.customerId, displayName: a.name }));
      const json = await call({
        email: email.trim(),
        encryptedToken,
        import: toImport,
      });
      if (!json.ok) {
        setError(json.error ?? "Import failed.");
        return;
      }
      setImportResults(json.results ?? []);
      setStep("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function toggle(customerId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  function toggleAll() {
    const selectableIds = accounts
      .filter((a) => !a.isManager)
      .map((a) => a.customerId);
    if (selected.size === selectableIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIds));
    }
  }

  const newCount = accounts.filter(
    (a) => !a.alreadyInLmiros && !a.isManager
  ).length;
  const existingCount = accounts.filter(
    (a) => a.alreadyInLmiros && !a.isManager
  ).length;

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-6 max-w-3xl">
      <StepIndicator step={step} />

      {error && (
        <div className="mb-5 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {step === "email" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Enter the Gmail that owns the Google Ads accounts you want to add.
            LMIROS will sign you in, then <b>automatically discover</b> every
            account under that Gmail.
          </p>
          <Field
            label="Gmail address"
            hint="The Google account that can open these Ads accounts."
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="marketing.04@enquirymail.com"
              className={inputCls}
              required
            />
          </Field>
          <button
            onClick={startConsent}
            disabled={busy || !email.trim()}
            className={btnPrimary}
          >
            {busy ? "Opening…" : "Sign in with this Gmail →"}
          </button>
        </div>
      )}

      {step === "code" && (
        <div className="space-y-4">
          <ol className="text-sm text-zinc-600 dark:text-zinc-300 space-y-2 list-decimal list-inside">
            <li>
              In the opened tab, <b>sign in as {email}</b> and click{" "}
              <b>Allow</b>.
            </li>
            <li>
              You&apos;ll land on a &quot;can&apos;t be reached&quot; page —
              copy that whole address-bar URL.
            </li>
          </ol>
          <Field label="Paste the code or URL">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="http://localhost/?code=4/0A…   (or just the code)"
              className={inputCls}
              required
            />
          </Field>
          <div className="flex gap-2">
            <button
              onClick={discover}
              disabled={busy || !code.trim()}
              className={btnPrimary}
            >
              {busy ? "Discovering accounts…" : "Discover accounts →"}
            </button>
            <button
              onClick={() => {
                setStep("email");
                setError(null);
              }}
              className={btnGhost}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === "select" && (
        <div className="space-y-4">
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            Found <b>{accounts.filter((a) => !a.isManager).length}</b> account
            {accounts.filter((a) => !a.isManager).length !== 1 ? "s" : ""} under{" "}
            <span className="font-mono">{email}</span>.
            {newCount > 0 && (
              <>
                {" "}
                <span className="text-emerald-600 dark:text-emerald-400">
                  {newCount} new
                </span>
              </>
            )}
            {existingCount > 0 && (
              <>
                {" · "}
                <span className="text-zinc-500">{existingCount} already in LMIROS</span>
              </>
            )}
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={
                        selected.size > 0 &&
                        selected.size ===
                          accounts.filter((a) => !a.isManager).length
                      }
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider">
                    Account
                  </th>
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-right">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts
                  .filter((a) => !a.isManager)
                  .map((a) => (
                    <tr
                      key={a.customerId}
                      className="border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer"
                      onClick={() => toggle(a.customerId)}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(a.customerId)}
                          onChange={() => toggle(a.customerId)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-zinc-500 font-mono">
                          {a.customerId}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {a.alreadyInLmiros && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                              in LMIROS
                            </span>
                          )}
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              a.status === "ENABLED"
                                ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                                : "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
                            }`}
                          >
                            {a.status.toLowerCase()}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {accounts.filter((a) => a.isManager).length > 0 && (
            <p className="text-xs text-zinc-500">
              {accounts.filter((a) => a.isManager).length} manager account
              {accounts.filter((a) => a.isManager).length !== 1 ? "s" : ""}{" "}
              hidden (MCC accounts don&apos;t serve ads).
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={importSelected}
              disabled={busy || selected.size === 0}
              className={btnPrimary}
            >
              {busy
                ? "Importing…"
                : `Import ${selected.size} account${selected.size !== 1 ? "s" : ""} →`}
            </button>
            <button
              onClick={() => {
                setStep("code");
                setError(null);
              }}
              className={btnGhost}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4">
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
            ✓ Imported <b>{importResults.length}</b> account
            {importResults.length !== 1 ? "s" : ""} from{" "}
            <span className="font-mono">{email}</span>.
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <tbody>
                {importResults.map((r) => (
                  <tr
                    key={r.customerId}
                    className="border-t border-zinc-100 dark:border-zinc-900 first:border-t-0"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.displayName}</div>
                      <div className="text-xs text-zinc-500 font-mono">
                        {r.customerId}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          r.action === "created"
                            ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                            : "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400"
                        }`}
                      >
                        {r.action}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-zinc-500">
            Go to{" "}
            <Link
              href="/admin/ad-accounts"
              className="text-blue-600 dark:text-blue-400 underline"
            >
              Ad accounts
            </Link>{" "}
            and click <b>Sync Google Ads now</b> to pull their metrics.
          </p>

          <div className="flex gap-2">
            <Link href="/admin/ad-accounts" className={btnPrimary}>
              View all accounts →
            </Link>
            <button
              onClick={() => {
                setStep("email");
                setEmail("");
                setCode("");
                setEncryptedToken("");
                setAccounts([]);
                setSelected(new Set());
                setImportResults([]);
                setError(null);
              }}
              className={btnGhost}
            >
              Add another Gmail
            </button>
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

function StepIndicator({ step }: { step: Step }) {
  const items: [Step, string][] = [
    ["email", "1 · Gmail"],
    ["code", "2 · Sign in"],
    ["select", "3 · Select"],
    ["done", "4 · Done"],
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
