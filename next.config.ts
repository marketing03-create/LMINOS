import type { NextConfig } from "next";

/**
 * Baseline security headers on every response.
 *
 * - frame-ancestors / X-Frame-Options: no other site may show LMIROS inside a
 *   frame (stops "click here" overlays tricking staff into pressing buttons).
 * - base-uri / object-src / form-action: close old injection tricks without
 *   touching scripts or styles, so nothing in the app can break.
 * - nosniff: the browser must not guess a file is HTML or script.
 * - Referrer-Policy: other sites see only "lmiros.vercel.app", never page paths.
 * - Permissions-Policy: no microphone/location/payment; camera only for this
 *   site (the screenshot card's photo picker).
 *
 * A full script Content-Security-Policy (nonces) is a separate, larger step.
 */
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  experimental: {
    // Client router cache: revisiting a section within 30s reuses the cached
    // page instantly instead of re-rendering on the server. Mutations still
    // show fresh data — every action button calls router.refresh(), which
    // bypasses this cache. Dashboards sync on 10-min crons, so 30s is safe.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
