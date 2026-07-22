import { describe, expect, it } from "vitest";
import { canAccessPath, homeForRole, isAdminRole } from "./access";
import type { Role } from "./authorize";

describe("page access policy (default-deny)", () => {
  // Admin-only surfaces. LMIROS is TikTok-only now, so this is the admin
  // TikTok view plus the shared admin tooling.
  const SENSITIVE = [
    "/admin/tiktok",
    "/admin/tiktok/all",
    "/admin/users",
    "/admin/integrations",
    "/admin/audit",
  ];

  it("admins see everything", () => {
    for (const role of ["hq_admin", "marketing_manager"] as Role[]) {
      for (const p of [...SENSITIVE, "/tiktok-live", "/no-access", "/anything"]) {
        expect(canAccessPath(role, p)).toBe(true);
      }
      expect(isAdminRole(role)).toBe(true);
      // The Overview — every card and chart in one place.
      expect(homeForRole(role)).toBe("/admin/tiktok/all");
    }
  });

  it("a live streamer only reaches its own TikTok + the neutral page", () => {
    const role: Role = "live_streamer";
    expect(canAccessPath(role, "/tiktok-live")).toBe(true);
    expect(canAccessPath(role, "/tiktok-live/import")).toBe(true);
    expect(canAccessPath(role, "/tiktok-live/abc-123")).toBe(true);
    expect(canAccessPath(role, "/no-access")).toBe(true);
    for (const p of SENSITIVE) expect(canAccessPath(role, p)).toBe(false);
    expect(homeForRole(role)).toBe("/tiktok-live");
    expect(isAdminRole(role)).toBe(false);
  });

  it("every other role is default-denied to only /no-access", () => {
    for (const role of ["team_lead", "sales_agent", "viewer"] as Role[]) {
      expect(canAccessPath(role, "/no-access")).toBe(true);
      for (const p of [...SENSITIVE, "/tiktok-live"]) {
        expect(canAccessPath(role, p)).toBe(false);
      }
      expect(homeForRole(role)).toBe("/no-access");
      expect(isAdminRole(role)).toBe(false);
    }
  });

  it("does not treat a prefix as a partial-word match", () => {
    // "/tiktok-live" must NOT accidentally allow "/tiktok-liveXYZ".
    expect(canAccessPath("live_streamer", "/tiktok-liveee")).toBe(false);
  });

  // The Overview carries every streamer's numbers side by side, so it is the
  // most sensitive page in the app: a live_streamer reaching it would see their
  // colleagues' performance. Pinned explicitly rather than relying on the
  // SENSITIVE list, and covering the sub-paths its own links generate.
  describe("the Overview is admin-only", () => {
    const OVERVIEW = "/admin/tiktok/all";
    const NON_ADMIN: Role[] = [
      "live_streamer",
      "team_lead",
      "sales_agent",
      "viewer",
    ];

    it("no non-admin role can reach it", () => {
      for (const role of NON_ADMIN) {
        expect(canAccessPath(role, OVERVIEW)).toBe(false);
      }
    });

    it("both admin roles can, and land there by default", () => {
      for (const role of ["hq_admin", "marketing_manager"] as Role[]) {
        expect(canAccessPath(role, OVERVIEW)).toBe(true);
        expect(homeForRole(role)).toBe(OVERVIEW);
      }
    });

    it("a denied role is sent somewhere it is actually allowed", () => {
      // Otherwise the redirect in the dashboard layout would bounce forever.
      for (const role of NON_ADMIN) {
        const home = homeForRole(role);
        expect(canAccessPath(role, home)).toBe(true);
      }
    });

    it("the drill-down pages behind it are admin-only too", () => {
      for (const role of NON_ADMIN) {
        expect(canAccessPath(role, "/admin/tiktok/some-account-id")).toBe(false);
        expect(canAccessPath(role, "/admin/tiktok/history")).toBe(false);
        expect(canAccessPath(role, "/admin/tiktok/screenshots")).toBe(false);
      }
    });

    it("cannot be reached by dressing the path up as an allowed one", () => {
      for (const p of [
        "/admin/tiktok/all/../../tiktok-live",
        "/tiktok-live/../admin/tiktok/all",
        "/admin/tiktok/all?streamer=all",
        "/ADMIN/TIKTOK/ALL",
      ]) {
        expect(canAccessPath("live_streamer", p)).toBe(false);
      }
    });
  });
});
