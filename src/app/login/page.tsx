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
  const [note, setNote] = useState<string | null>(null);

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
    setNote(null);
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
      setNote(`Code sent to ${address}. It expires in a few minutes.`);
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
    setNote(null);
  }

  const inputCls =
    "w-full h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

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
          Loan Marketing Intelligence &amp; Revenue OS
        </p>

        {urlError === "domain_not_allowed" && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            Your email domain is not on the allowlist. Contact an admin.
          </div>
        )}
        {urlError === "auth_failed" && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            That sign-in didn&apos;t complete. Please try again.
          </div>
        )}

        {err && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {err}
          </div>
        )}

        {step === "email" ? (
          <>
            {/* Email code first — it works with ANY mailbox, so it's the path
                that never dead-ends someone. */}
            <form onSubmit={sendCode} className="mt-6">
              <label htmlFor="email" className="block text-sm font-medium">
                Work email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="you@company.com"
                className={`mt-1.5 ${inputCls}`}
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="mt-3 w-full h-10 rounded-md bg-zinc-900 text-zinc-50 hover:bg-zinc-700 disabled:opacity-50 text-sm font-medium dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {loading ? "Sending…" : "Email me a code"}
              </button>
              <p className="mt-2 text-xs text-zinc-500">
                Works with any email — Outlook, Gmail, anything.
              </p>
            </form>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              <span className="text-[11px] uppercase tracking-wider text-zinc-400">
                or
              </span>
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>

            <button
              onClick={signInWithGoogle}
              disabled={loading}
              className="w-full h-10 rounded-md border border-zinc-300 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Continue with Google
            </button>
          </>
        ) : (
          <form onSubmit={verifyCode} className="mt-6">
            {note && <p className="mb-3 text-sm text-zinc-500">{note}</p>}
            <label htmlFor="code" className="block text-sm font-medium">
              Enter the 6-digit code
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
              className={`mt-1.5 text-center text-lg tracking-[0.3em] tabular-nums ${inputCls}`}
            />
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="mt-3 w-full h-10 rounded-md bg-zinc-900 text-zinc-50 hover:bg-zinc-700 disabled:opacity-50 text-sm font-medium dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {loading ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={startOver}
              disabled={loading}
              className="mt-3 w-full text-sm text-zinc-500 hover:underline disabled:opacity-50"
            >
              Use a different email
            </button>
            <p className="mt-4 text-xs text-zinc-500">
              No email? Check your spam folder.
            </p>
          </form>
        )}

        <p className="mt-6 text-xs text-zinc-500">
          Internal staff only. Access is logged.
        </p>
      </div>
    </div>
  );
}
