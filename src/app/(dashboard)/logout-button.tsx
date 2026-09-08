"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Sign out of LMIROS. Clears the Supabase session (cookies), then hard-navigates
 * to /login so the server re-reads the now-empty session. From there "Continue
 * with Google" prompts the account chooser, so a different Google account can be
 * used.
 *
 * Sizing note: this is 48px and full width below `lg` and the original 36px at
 * `lg`, because the same component now has two very different neighbours. In the
 * desktop sidebar footer it is a quiet last item under a wall of nav links. On a
 * phone it is the last row of the "More" sheet and of the streamer's profile
 * page, where it is the only thing on screen a thumb is aiming at — and where a
 * mis-tap costs a whole re-login. It stays one component rather than gaining a
 * `size` prop so that no call site can pick the wrong one.
 */
export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Even if the network call fails, still bounce to /login — the local
      // session is cleared and the server will require a fresh sign-in.
    }
    window.location.href = "/login";
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="flex min-h-12 lg:min-h-0 w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-base lg:text-sm font-medium text-zinc-700 hover:bg-zinc-200/70 active:bg-zinc-200/70 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
