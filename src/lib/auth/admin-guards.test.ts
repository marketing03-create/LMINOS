import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static data-leak guard. Every admin page must check the role ITSELF (the
 * layout's check can be skipped — see page-guard.ts), every streamer page must
 * scope itself, and every /api/admin route must require an admin. A new file
 * that forgets fails here before it can ship.
 */

const ROOT = process.cwd();

function files(dir: string, name: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...files(p, name));
    else if (entry === name) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).replaceAll("\\", "/");

describe("admin and streamer pages check the role themselves", () => {
  const adminPages = files(join(ROOT, "src/app/(dashboard)/admin"), "page.tsx");

  it("finds the admin pages", () => {
    expect(adminPages.length).toBeGreaterThan(5);
  });

  it.each(adminPages.map(rel))("%s calls requireAdminPage()", (p) => {
    expect(readFileSync(join(ROOT, p), "utf8")).toMatch(/await requireAdminPage\(\)/);
  });

  const livePages = files(join(ROOT, "src/app/(dashboard)/tiktok-live"), "page.tsx");
  it.each(livePages.map(rel))("%s calls requireLivePage()", (p) => {
    expect(readFileSync(join(ROOT, p), "utf8")).toMatch(/requireLivePage\(\)/);
  });
});

describe("admin APIs require an admin", () => {
  const routes = files(join(ROOT, "src/app/api/admin"), "route.ts");

  it.each(routes.map(rel))("%s uses requireRole(ADMIN_ROLES) in every handler", (p) => {
    const src = readFileSync(join(ROOT, p), "utf8");
    const handlers = src.match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? [];
    const guards = src.match(/requireRole\(ADMIN_ROLES\)/g) ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    expect(guards.length).toBeGreaterThanOrEqual(handlers.length);
  });
});
