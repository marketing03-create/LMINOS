"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A small "?" button that reveals a short explanation on click. The popover is
 * position:fixed AND rendered in a portal to <body>, so it never runs off-screen
 * and is never clipped by an overflow/transformed ancestor (e.g. a scrollable
 * table). Its left/top are JS-clamped to the viewport. Click the button again,
 * click outside, or press Escape to close.
 */
export function HelpTip({ text, label }: { text: string; label?: string }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const WIDTH = 240;
    const MARGIN = 8;
    function place() {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      // Prefer right-aligned under the button, then clamp inside the viewport.
      let left = b.right - WIDTH;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - WIDTH - MARGIN));
      // Open downward; if that would run off the bottom, flip above the button.
      const EST_H = 120;
      const top =
        b.bottom + 6 + EST_H > window.innerHeight ? Math.max(MARGIN, b.top - 6 - EST_H) : b.bottom + 6;
      setPos({ top, left });
    }
    place();
    function onDoc(e: MouseEvent) {
      if (!btnRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          // preventDefault too, so a "?" nested inside a card <Link> opens the
          // tooltip instead of navigating away.
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={label ?? "What's this?"}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-600 text-[10px] font-semibold leading-none text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        ?
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 240 }}
            className="z-[100] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300 shadow-xl"
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
