"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Edit (link) + Delete (DELETE request with confirm) actions for a table row. */
export function RowActions({
  editHref,
  deleteUrl,
  confirmLabel,
}: {
  editHref: string;
  deleteUrl: string;
  confirmLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!confirm(confirmLabel)) return;
    setBusy(true);
    try {
      const res = await fetch(deleteUrl, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `Delete failed (${res.status}).`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex gap-2 justify-end">
      <Link
        href={editHref}
        className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2.5 py-1 text-xs"
      >
        Edit
      </Link>
      <button
        onClick={del}
        disabled={busy}
        className="inline-flex items-center rounded-md bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 px-2.5 py-1 text-xs disabled:opacity-50"
      >
        {busy ? "…" : "Delete"}
      </button>
    </div>
  );
}
