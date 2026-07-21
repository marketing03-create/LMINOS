"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type WebsiteOpt = { id: string; slug: string; name: string };

export type BlueprintView = {
  accountName: string;
  finalUrl: string;
  conversionAction?: { name: string; category: string; note: string };
  campaigns: {
    name: string;
    dailyBudgetMyr: number;
    biddingStrategy: string;
    geoTargets: string[];
    languages: string[];
    adScheduleNote: string;
    negativeKeywords: string[];
    adGroups: {
      name: string;
      theme: string;
      keywords: { text: string; matchType: string }[];
      ads: { headlines: string[]; descriptions: string[]; path1?: string; path2?: string }[];
    }[];
  }[];
  complianceNotes: string;
  assumptions: string;
};

export type BlueprintRow = {
  id: string;
  title: string;
  status: string;
  riskTier: string;
  dailyBudgetMyr: number | null;
  validatedAt: string | null;
  builtAt: string | null;
  error: string | null;
  hasAccount: boolean;
  externalCustomerId: string | null;
  websiteName: string;
  blueprint: BlueprintView;
};

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-MY", { hour12: false }) : null;

export function AdsBlueprintsClient({
  blueprints,
  websites,
  aiConfigured,
  liveEnabled,
  budgetCap,
}: {
  blueprints: BlueprintRow[];
  websites: WebsiteOpt[];
  aiConfigured: boolean;
  liveEnabled: boolean;
  budgetCap: number | null;
}) {
  const router = useRouter();
  const [websiteId, setWebsiteId] = useState(websites[0]?.id ?? "");
  const [url, setUrl] = useState("");
  const [planning, setPlanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [confirmText, setConfirmText] = useState<Record<string, string>>({});

  async function call(endpoint: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setError(json.error ?? `Request failed (${res.status}).`);
        return false;
      }
      if (json.message) setNotice(json.message);
      else if (json.applied === false) setNotice("Validated against Google. Apply by hand.");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async function plan() {
    if (!websiteId || !url) return;
    setPlanning(true);
    setError(null);
    setNotice(null);
    const ok = await call("/api/ad-blueprints/plan", "POST", {
      websiteId,
      destinationUrl: url,
    });
    if (ok) {
      setNotice("Draft ready — review it below.");
      setUrl("");
    }
    setPlanning(false);
  }

  async function action(id: string, sub: string, body?: unknown) {
    setBusyId(id);
    await call(`/api/ad-blueprints/${id}${sub}`, "POST", body);
    setBusyId(null);
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    try {
      const parsed = JSON.parse(editing[id]);
      const ok = await call(`/api/ad-blueprints/${id}`, "PATCH", { blueprint: parsed });
      if (ok) {
        setEditing((e) => {
          const n = { ...e };
          delete n[id];
          return n;
        });
        setNotice("Saved. Re-validate before building.");
      }
    } catch {
      setError("That isn't valid JSON — check the braces/commas.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    await call(`/api/ad-blueprints/${id}`, "DELETE");
    setBusyId(null);
  }

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-6">
      {!aiConfigured && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          AI not configured. Add <code>AI_GATEWAY_API_KEY</code> (Vercel AI
          Gateway) to draft blueprints. Same key as Ads Proposals.
        </div>
      )}

      <div
        className={`rounded-md border px-4 py-3 text-sm ${
          liveEnabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
            : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
        }`}
      >
        {liveEnabled ? (
          <>
            <b>Live build ON.</b> Approved + validated blueprints can be built in
            Google Ads (everything created PAUSED).
          </>
        ) : (
          <>
            <b>Live build OFF</b> — Google Basic write access is pending. You can
            draft, edit, and <b>dry-run validate</b> against Google for free, then
            apply by hand / via Google Ads Editor. One env flag switches on
            one-click build later, no rebuild.
          </>
        )}
        {budgetCap != null && (
          <> Daily budget cap: <b>RM {budgetCap}</b>/day (enforced).</>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
          {notice}
        </div>
      )}

      {/* Plan form */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4 space-y-3">
        <div className="text-sm font-semibold">Draft a new account</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-0 w-full sm:w-auto">
            <div className="text-xs font-medium mb-1">Website</div>
            <select
              value={websiteId}
              onChange={(e) => setWebsiteId(e.target.value)}
              className={`${inputCls} w-full`}
            >
              {websites.length === 0 && <option value="">No websites</option>}
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block flex-1 min-w-[260px]">
            <div className="text-xs font-medium mb-1">Landing page URL</div>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yoursite.com/apply"
              className={`${inputCls} w-full`}
            />
          </label>
          <button
            onClick={plan}
            disabled={planning || !websiteId || !url || !aiConfigured}
            className={btnPrimary}
          >
            {planning ? "Drafting… (~20s)" : "Draft blueprint"}
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          The landing page must show your physical address, fees, the max APR, and
          a representative cost example, and offer loans repayable in 61+ days
          (Google&apos;s rules for loan ads).
        </p>
      </div>

      {/* Blueprints */}
      {blueprints.length === 0 ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 px-4 py-10 text-center text-sm text-zinc-500">
          No blueprints yet. Pick a website + landing page above and click{" "}
          <b>Draft blueprint</b>.
        </div>
      ) : (
        blueprints.map((b) => {
          const open = expanded.has(b.id);
          const isEditing = b.id in editing;
          const busy = busyId === b.id;
          return (
            <div
              key={b.id}
              className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{b.title}</span>
                    <StatusBadge status={b.status} />
                    <RiskBadge risk={b.riskTier} />
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {b.websiteName} ·{" "}
                    {b.dailyBudgetMyr != null ? `RM ${b.dailyBudgetMyr}/day total` : "—"} ·{" "}
                    {b.hasAccount
                      ? `account ${b.externalCustomerId}`
                      : "no Google account linked"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    {b.validatedAt && `Validated ${fmtTime(b.validatedAt)}. `}
                    {b.builtAt && `Built ${fmtTime(b.builtAt)}.`}
                  </div>
                </div>
                <button onClick={() => toggle(b.id)} className={btnSmall}>
                  {open ? "Hide plan" : "View plan"}
                </button>
              </div>

              {b.error && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {b.error}
                </div>
              )}

              {!b.hasAccount && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  Connect this website&apos;s Google account (Ad accounts → Add) to
                  validate or build. You can still draft and edit now.
                </p>
              )}

              {open && (
                <div className="mt-3 space-y-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editing[b.id]}
                        onChange={(e) =>
                          setEditing((s) => ({ ...s, [b.id]: e.target.value }))
                        }
                        rows={20}
                        className="w-full font-mono text-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-2"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(b.id)}
                          disabled={busy}
                          className={btnPrimary}
                        >
                          Save edits
                        </button>
                        <button
                          onClick={() =>
                            setEditing((s) => {
                              const n = { ...s };
                              delete n[b.id];
                              return n;
                            })
                          }
                          className={btnSmall}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Preview blueprint={b.blueprint} />
                  )}

                  {["draft", "pending"].includes(b.status) && !isEditing && (
                    <button
                      onClick={() =>
                        setEditing((s) => ({
                          ...s,
                          [b.id]: JSON.stringify(b.blueprint, null, 2),
                        }))
                      }
                      className={btnSmall}
                    >
                      Edit (advanced)
                    </button>
                  )}

                  <ComplianceChecklist notes={b.blueprint.complianceNotes} />
                </div>
              )}

              {/* Actions */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {b.status === "draft" && (
                  <button
                    onClick={() => action(b.id, "/transition", { action: "submit" })}
                    disabled={busy}
                    className={btnPrimary}
                  >
                    Submit for approval
                  </button>
                )}
                {b.status === "pending" && (
                  <>
                    <button
                      onClick={() => action(b.id, "/transition", { action: "approve" })}
                      disabled={busy}
                      className={btnApprove}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => action(b.id, "/transition", { action: "reject" })}
                      disabled={busy}
                      className={btnSmall}
                    >
                      Reject
                    </button>
                  </>
                )}
                {b.status === "approved" && (
                  <>
                    <button
                      onClick={() => action(b.id, "/validate")}
                      disabled={busy || !b.hasAccount}
                      className={btnPrimary}
                    >
                      {busy ? "Working…" : "Validate (dry-run)"}
                    </button>
                    <input
                      placeholder="type BUILD"
                      value={confirmText[b.id] ?? ""}
                      onChange={(e) =>
                        setConfirmText((s) => ({ ...s, [b.id]: e.target.value }))
                      }
                      className={`${inputCls} w-28`}
                    />
                    <button
                      onClick={() =>
                        action(b.id, "/build", { confirm: confirmText[b.id] })
                      }
                      disabled={busy || !b.validatedAt}
                      className={btnDanger}
                      title={!b.validatedAt ? "Validate first" : ""}
                    >
                      {liveEnabled ? "Build in Google Ads" : "Build (dry-run — live off)"}
                    </button>
                  </>
                )}
                {b.status === "built" && (
                  <>
                    <input
                      placeholder="type REVERT"
                      value={confirmText[b.id] ?? ""}
                      onChange={(e) =>
                        setConfirmText((s) => ({ ...s, [b.id]: e.target.value }))
                      }
                      className={`${inputCls} w-32`}
                    />
                    <button
                      onClick={() =>
                        action(b.id, "/revert", { confirm: confirmText[b.id] })
                      }
                      disabled={busy}
                      className={btnSmall}
                    >
                      Revert (tear down)
                    </button>
                  </>
                )}
                {["rejected", "failed", "reverted"].includes(b.status) && (
                  <button onClick={() => remove(b.id)} disabled={busy} className={btnSmall}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function Preview({ blueprint }: { blueprint: BlueprintView }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="text-xs text-zinc-500">
        Final URL: <span className="font-mono">{blueprint.finalUrl}</span>
        {blueprint.conversionAction && (
          <> · Conversion: {blueprint.conversionAction.name}</>
        )}
      </div>
      {blueprint.campaigns.map((c, i) => (
        <div
          key={i}
          className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3"
        >
          <div className="font-medium">{c.name}</div>
          <div className="text-xs text-zinc-500">
            RM {c.dailyBudgetMyr}/day · {c.biddingStrategy} · {c.languages.join("/")}
            {c.geoTargets.length > 0 && <> · {c.geoTargets.join(", ")}</>}
          </div>
          {c.adScheduleNote && (
            <div className="text-[11px] text-zinc-400 mt-0.5">{c.adScheduleNote}</div>
          )}
          {c.negativeKeywords.length > 0 && (
            <div className="mt-1 text-xs">
              <span className="text-zinc-500">Negatives:</span>{" "}
              <span className="font-mono">{c.negativeKeywords.join(", ")}</span>
            </div>
          )}
          <div className="mt-2 space-y-2">
            {c.adGroups.map((ag, j) => (
              <div key={j} className="pl-3 border-l-2 border-zinc-200 dark:border-zinc-800">
                <div className="text-xs font-medium">{ag.name}</div>
                <div className="text-[11px] text-zinc-500">
                  Keywords:{" "}
                  <span className="font-mono">
                    {ag.keywords.map((k) => `${k.text} [${k.matchType.toLowerCase()}]`).join(", ")}
                  </span>
                </div>
                {ag.ads.map((ad, k) => (
                  <div key={k} className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                    <span className="text-zinc-400">Headlines:</span> {ad.headlines.join(" · ")}
                    <br />
                    <span className="text-zinc-400">Descriptions:</span> {ad.descriptions.join(" · ")}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ComplianceChecklist({ notes }: { notes: string }) {
  return (
    <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-xs">
      <summary className="cursor-pointer font-medium text-zinc-600 dark:text-zinc-300">
        Before you go live — manual steps Google requires (no tool can do these)
      </summary>
      <ul className="mt-2 list-disc pl-5 space-y-1 text-zinc-500">
        <li>Account created + identity/business verified in Google Ads.</li>
        <li>Billing / payment method linked (in the Google Ads UI).</li>
        <li>
          Landing page shows physical address, all fees, max APR, a representative
          cost example; loans repayable 61+ days.
        </li>
        <li>Conversion tracking tag placed on the website (so leads count).</li>
        <li>The website&apos;s Google account connected to LMIROS (to build).</li>
      </ul>
      {notes && (
        <p className="mt-2 text-zinc-500">
          <b>AI compliance note:</b> {notes}
        </p>
      )}
    </details>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const cls =
    risk === "high"
      ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
      : risk === "medium"
        ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
        : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400";
  return <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>{risk} risk</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "built" || status === "approved"
      ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
      : status === "rejected" || status === "reverted"
        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
        : status === "failed"
          ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
          : "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400";
  return <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>{status}</span>;
}

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";
const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
const btnApprove =
  "inline-flex items-center rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50";
const btnDanger =
  "inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50";
const btnSmall =
  "inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 text-xs disabled:opacity-50";
