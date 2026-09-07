"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Login page reads `?error=…` and `?redirect=…` query params at runtime, so
// it can't be statically prerendered. Forcing dynamic rendering skips the
// CSR bailout check Next.js does at build time.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  // "/" sends the user to the right home for their role (admin vs streamer).
  const redirect = searchParams.get("redirect") ?? "/";

  async function signInWithGoogle() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${redirect}`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        // Always show the Google account chooser so a signed-out user can pick a
        // different account (instead of Google silently re-using the last one).
        queryParams: { prompt: "select_account" },
      },
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-6">
      <div className="w-full max-w-sm border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 bg-white dark:bg-zinc-950 shadow-sm">
        <Image
          src="/logo.png"
          alt=""
          width={48}
          height={48}
          className="mb-3 h-12 w-12 rounded-xl"
          priority
        />
        <h1 className="text-2xl font-semibold tracking-tight">LMIROS</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Loan Marketing Intelligence & Revenue OS
        </p>

        {error === "domain_not_allowed" && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            Your email domain is not on the allowlist. Contact an admin.
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="mt-6 w-full h-10 rounded-md bg-zinc-900 text-zinc-50 hover:bg-zinc-700 disabled:opacity-50 text-sm font-medium dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>

        <p className="mt-6 text-xs text-zinc-500">
          Internal staff only. Access is logged.
        </p>
      </div>
    </div>
  );
}
