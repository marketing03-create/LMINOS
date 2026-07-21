"use client";

import { useEffect, useState } from "react";

/**
 * Screenshot thumbnail that opens the full image in a centered in-page lightbox
 * (instead of a new browser tab). Click the backdrop, the ✕, or press Escape to
 * close.
 */
export function ScreenshotThumb({
  url,
  alt = "TikTok LIVE screenshot",
}: {
  url: string | undefined;
  alt?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Lock background scroll while the lightbox is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!url) {
    return (
      <div className="w-40 h-40 rounded-lg border border-zinc-200 dark:border-zinc-800 grid place-items-center text-xs text-zinc-400">
        image unavailable
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="w-40 h-40 object-cover rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 cursor-zoom-in transition-opacity hover:opacity-90"
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-4 right-4 text-3xl leading-none text-white/80 hover:text-white"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl cursor-zoom-out"
          />
        </div>
      )}
    </>
  );
}
