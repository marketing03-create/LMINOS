"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

/**
 * Two ways in, one account either way.
 *
 * Google SSO was the only door, which quietly required every staff member to
 * HAVE a Google account — a streamer on an Outlook address simply got "couldn't
 * find this account" from Google and was stuck. The email code fixes that for
 * any mailbox: we send a 6-digit code, they type it back.
 *
 * `shouldCreateUser: false` is the important bit. An admin still creates every
 * account first (Admin → Users), exactly as before; the code only proves the
 * person owns that mailbox. A stranger typing their address gets nothing.
 *
 * The screen carries no standing advisory text — only messages that respond to
 * what the person just did. A line that is always true is a line everyone stops
 * reading, and it competes with the one field they need to fill in.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  // "/" sends the user to the right home for their role (admin vs streamer).
  const redirect = searchParams.get("redirect") ?? "/";

  const [loading, setLoading] = useState(false);
  // "email" = asking for the address; "code" = code sent, waiting for it back.
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

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

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    setLoading(true);
    setErr(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        // Never self-register: an admin adds the person first, so an unknown
        // address must fail here rather than quietly creating an account.
        options: { shouldCreateUser: false },
      });
      if (error) {
        // Supabase says "Signups not allowed for otp" when the address has no
        // account. That wording would send a streamer to the wrong conclusion.
        setErr(
          /signup|not allowed|not found/i.test(error.message)
            ? "That email isn't set up yet. Ask your admin to add you first."
            : error.message
        );
        return;
      }
      setStep("code");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    const token = code.trim();
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "email",
      });
      if (error) {
        setErr(
          /expired|invalid/i.test(error.message)
            ? "That code is wrong or has expired. Send a new one."
            : error.message
        );
        return;
      }
      // Session cookies are set — go where the proxy was sending them.
      router.replace(redirect);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function startOver() {
    setStep("email");
    setCode("");
    setErr(null);
  }

  // Full-width, 44px tall: comfortably tappable on a phone, which is where
  // streamers sign in.
  const field =
    "w-full h-11 rounded-lg border border-zinc-300 bg-white px-3.5 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
  const primary =
    "w-full h-11 rounded-lg bg-blue-600 text-[15px] font-medium text-white transition hover:bg-blue-500 active:scale-[0.99] disabled:opacity-40 disabled:hover:bg-blue-600";
  const secondary =
    "w-full h-11 rounded-lg border border-zinc-300 text-[15px] font-medium transition hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900";

  const banner = urlError === "domain_not_allowed"
    ? "Your email domain is not on the allowlist. Contact an admin."
    : urlError === "auth_failed"
      ? "That sign-in didn't complete. Please try again."
      : null;
  const message = err ?? banner;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-[380px]">
        {/* Logo and name centred above the card — the card then holds nothing
            but the task, so the eye lands on the input, not on chrome. */}
        <div className="mb-7 flex flex-col items-center">
          <Image
            src="/logo.png"
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded-2xl shadow-sm"
            priority
          />
          <h1 className="mt-3.5 text-[22px] font-semibold tracking-tight">LMIROS</h1>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {message && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
            >
              {message}
            </div>
          )}

          {step === "email" ? (
            <>
              <form onSubmit={sendCode}>
                <label htmlFor="email" className="block text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder="you@company.com"
                  className={`mt-2 ${field}`}
                />
                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className={`mt-3 ${primary}`}
                >
                  {loading ? "Sending…" : "Email me a code"}
                </button>
              </form>

              {/* No divider: the two buttons already read as primary and
                  fallback from their weight alone, so a labelled rule was one
                  more thing on screen doing no work. */}
              <button
                onClick={signInWithGoogle}
                disabled={loading}
                className={`mt-2.5 ${secondary}`}
              >
                Continue with Google
              </button>
            </>
          ) : (
            <form onSubmit={verifyCode}>
              {/* The address is the one thing they need to confirm here — if the
                  code never arrives, a typo is the usual reason. */}
              <p className="text-sm text-zinc-500">
                We sent a code to{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {email.trim().toLowerCase()}
                </span>
              </p>

              <label htmlFor="code" className="mt-5 block text-sm font-medium">
                6-digit code
              </label>
              <input
                id="code"
                // One-time-code autocomplete lets phones offer the code straight
                // from the notification instead of making them switch apps.
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={loading}
                placeholder="123456"
                className={`mt-2 text-center text-xl tracking-[0.4em] tabular-nums ${field}`}
              />
              <button
                type="submit"
                disabled={loading || !code.trim()}
                className={`mt-3 ${primary}`}
              >
                {loading ? "Checking…" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={startOver}
                disabled={loading}
                className="mt-4 w-full text-sm text-zinc-500 transition hover:text-zinc-900 disabled:opacity-40 dark:hover:text-zinc-100"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
