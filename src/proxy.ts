import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/api/ingest", // webhooks, signature-verified
  "/api/webhooks", // Telegram bot etc.
  "/api/cron", // scheduled jobs — self-guard via CRON_SECRET bearer token
  "/login",
  "/auth", // Supabase OAuth callback
  "/_next",
  "/favicon",
  // PWA assets the OS fetches WITHOUT a session (home-screen install/launch) —
  // must be reachable unauthenticated or "Add to Home Screen" can't read them.
  "/manifest.webmanifest",
  "/apple-icon",
  "/icon",
  // The brand mark, rendered on the sign-in page itself — so it is fetched
  // before any session exists and must not be bounced to /login.
  "/logo.png",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Expose the current path to server components (the dashboard layout reads it
  // to gate the restricted live-streamer role to its own pages). Cheap, no DB.
  request.headers.set("x-lmiros-pathname", pathname);

  // Dev-only bypass so the UI shell can be previewed without Supabase.
  // Ignored in production so a leaked env can never open prod.
  if (
    process.env.LMIROS_DEV_BYPASS_AUTH === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims verifies the session JWT locally (no auth-server round trip on
  // every request, unlike getUser) and still refreshes expired sessions.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  const email = typeof claims.email === "string" ? claims.email : undefined;

  // Optional email-domain allowlist
  const allowed = process.env.AUTH_ALLOWED_DOMAINS?.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed && allowed.length > 0 && email) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain || !allowed.includes(domain)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "domain_not_allowed");
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
