import { describe, expect, it } from "vitest";
import { canAccessPath, homeForRole, isAdminRole } from "./access";
import type { Role } from "./authorize";

describe("page access policy (default-deny)", () => {
  const SENSITIVE = [
    "/dashboard",
    "/leads",
    "/leads/123",
    "/sales",
    "/roas",
    "/rejected",
    "/agents",
    "/admin/users",
    "/admin/ad-accounts",
    "/admin/integrations",
    "/trends",
  ];

  it("admins see everything", () => {
    for (const role of ["hq_admin", "marketing_manager"] as Role[]) {
      for (const p of [...SENSITIVE, "/tiktok-live", "/no-access", "/anything"]) {
        expect(canAccessPath(role, p)).toBe(true);
      }
      expect(isAdminRole(role)).toBe(true);
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
});
