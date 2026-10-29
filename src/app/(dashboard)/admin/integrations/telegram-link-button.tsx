"use client";

import { useState } from "react";

/**
 * "Link my Telegram": asks the server for a 15-minute signed pairing link for
 * the signed-in admin and opens it — Telegram then starts the bot with that
 * token. Replaces "/start <email>", which anyone could send for any account.
 */
export function TelegramLinkButton() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function link() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        setErr(json.error ?? "Couldn't make a link. Try again.");
        return;
      }
      window.location.href = json.url;
    } catch {
      setErr("Couldn't make a link. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={link}
        disabled={busy}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-[15px] font-medium text-white transition-colors hover:bg-blue-500 active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 sm:w-auto dark:focus-visible:ring-offset-zinc-950"
      >
        {busy ? "Opening Telegram…" : "Link my Telegram"}
      </button>
      {err && (
        <p role="status" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {err}
        </p>
      )}
    </div>
  );
}
