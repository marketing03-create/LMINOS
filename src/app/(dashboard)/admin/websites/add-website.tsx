"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddWebsite() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [whatsappNumber, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/websites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, slug, whatsappNumber }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to create website.");
        return;
      }
      setName("");
      setSlug("");
      setWhatsapp("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={btnPrimary}>
        + Add website
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4 flex flex-wrap items-end gap-3"
    >
      <label className="block">
        <div className="text-xs font-medium mb-1">Name</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Expert Finance 2U"
          className={inputCls}
          required
        />
      </label>
      <label className="block">
        <div className="text-xs font-medium mb-1">
          Slug <span className="text-zinc-400">(optional)</span>
        </div>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="expert_finance_2u"
          className={inputCls}
        />
      </label>
      <label className="block">
        <div className="text-xs font-medium mb-1">
          WhatsApp <span className="text-zinc-400">(optional)</span>
        </div>
        <input
          value={whatsappNumber}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="60123456789"
          className={inputCls}
        />
      </label>
      <button type="submit" disabled={busy} className={btnPrimary}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
        Cancel
      </button>
      {error && <div className="w-full text-sm text-red-600 dark:text-red-400">{error}</div>}
      <p className="w-full text-xs text-zinc-500">
        The slug must match the Zoho “Website” value for this site's leads (that's
        how leads, spend, and revenue join to the website).
      </p>
    </form>
  );
}

const inputCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";
const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50";
const btnGhost =
  "inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 px-4 py-2 text-sm";
