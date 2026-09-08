"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "system" | "dark";
const KEY = "lmiros-theme";

function apply(mode: Mode) {
  const dark =
    mode === "dark" ||
    (mode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Apple-style segmented appearance picker: Light / Auto / Dark.
 *
 * The three-state semantics, the `lmiros-theme` storage key and the `.dark`
 * class are a contract shared with the pre-paint inline script in
 * `src/app/layout.tsx` — if the two ever disagree, the page paints in one theme
 * and then snaps to the other on hydration. Nothing below this comment touches
 * any of that; this component was only ever wrong about its size.
 *
 * It lives in two places at once, which is the whole reason for the `lg:`
 * hedging on the buttons: the streamer's profile page, where it is a real
 * standalone control a thumb has to hit, and the bottom of the `lg+` sidebar
 * rail, where it is a 24px afterthought under the nav. Growing it to the 44px
 * segment (§2.2) everywhere would push the sidebar's email row and Log out
 * button down inside a fixed-height column, so the growth is scoped below `lg`
 * and the desktop rail keeps its compact box. The one desktop delta accepted is
 * the label going from 11px to `text-xs` (12px): the project-wide ban on
 * arbitrary sub-12px type outranks a single pixel, and at `w-64` each segment
 * still gets ~76px, so nothing rewraps.
 *
 * `active:` is not belt-and-braces next to `hover:`. A thumb has no hover, so
 * on the phone the hover rules are dead code and the press would land with no
 * feedback at all — which on a control whose whole job is "did that register?"
 * reads as a broken button. The hover rules stay because the desktop rail still
 * has a mouse.
 */
export function ThemeToggle() {
  // null until mounted — avoids a server/client hydration mismatch.
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Mode | null) ?? "system";
    setMode(stored);

    // While on Auto, follow live OS theme changes.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const cur = (localStorage.getItem(KEY) as Mode | null) ?? "system";
      if (cur === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function set(next: Mode) {
    setMode(next);
    localStorage.setItem(KEY, next);
    apply(next);
  }

  const options: { value: Mode; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Light", icon: <SunIcon /> },
    { value: "system", label: "Auto", icon: <AutoIcon /> },
    { value: "dark", label: "Dark", icon: <MoonIcon /> },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex rounded-full bg-zinc-200/70 dark:bg-zinc-800/80 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={mode === o.value}
          onClick={() => set(o.value)}
          className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 lg:min-h-0 lg:gap-1 lg:px-2 lg:py-1 lg:text-xs ${
            mode === o.value
              ? "bg-white dark:bg-zinc-600 text-zinc-900 dark:text-white shadow-sm active:bg-zinc-100 dark:active:bg-zinc-500"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 active:bg-white/70 active:text-zinc-900 dark:active:bg-zinc-700 dark:active:text-zinc-100"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SunIcon() {
  return (
    <svg
      width="12"
      height="12"
      className="h-3.5 w-3.5 shrink-0 lg:h-3 lg:w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function AutoIcon() {
  return (
    <svg
      width="12"
      height="12"
      className="h-3.5 w-3.5 shrink-0 lg:h-3 lg:w-3"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="12"
      height="12"
      className="h-3.5 w-3.5 shrink-0 lg:h-3 lg:w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
