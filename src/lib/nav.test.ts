import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { canAccessPath } from "./auth/access";
import type { Role } from "./auth/authorize";
import { activeHref, navFor } from "./nav";

const ROLES: Role[] = ["hq_admin", "marketing_manager", "live_streamer", "viewer", "team_lead", "sales_agent"];
const hrefs = (role: Role) => navFor(role).flatMap((g) => g.items.map((i) => i.href));

describe("mobile menu never offers a page the role can't open", () => {
  it.each(ROLES)("%s: every menu link passes the access policy", (role) => {
    for (const href of hrefs(role)) expect(canAccessPath(role, href), `${role} → ${href}`).toBe(true);
  });

  it("non-admins see no admin pages", () => {
    for (const role of ["live_streamer", "viewer", "team_lead", "sales_agent"] as Role[]) {
      expect(hrefs(role).some((h) => h.startsWith("/admin"))).toBe(false);
    }
  });
});

describe("mobile menu lists every page", () => {
  // Static pages under the dashboard (dynamic [id] pages are reached from lists).
  const root = join(process.cwd(), "src/app/(dashboard)");
  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        if (!e.startsWith("[")) walk(p);
      } else if (e === "page.tsx") {
        pages.push("/" + relative(root, dir).replaceAll("\\", "/"));
      }
    }
  };
  walk(root);
  // /admin/tiktok only redirects to /admin/users.
  const real = pages.filter((p) => p !== "/admin/tiktok");

  it("finds the pages", () => expect(real.length).toBeGreaterThan(8));

  it.each(real)("%s is in some role's menu", (page) => {
    expect(ROLES.some((r) => hrefs(r).includes(page))).toBe(true);
  });

  it.each(ROLES)("%s: every page the role can open is in its menu", (role) => {
    for (const page of real) {
      if (page === "/no-access" && role !== "viewer" && role !== "team_lead" && role !== "sales_agent") continue;
      if (canAccessPath(role, page)) expect(hrefs(role), `${role} missing ${page}`).toContain(page);
    }
  });
});

describe("activeHref", () => {
  it("picks the most specific match", () => {
    const g = navFor("live_streamer");
    expect(activeHref(g, "/tiktok-live/import")).toBe("/tiktok-live/import");
    expect(activeHref(g, "/tiktok-live/abc-123")).toBe("/tiktok-live");
  });
});
