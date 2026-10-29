import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps paths on this site, with query and hash", () => {
    expect(safeRedirectPath("/tiktok-live")).toBe("/tiktok-live");
    expect(safeRedirectPath("/admin/tiktok/all?range=7d#x")).toBe("/admin/tiktok/all?range=7d#x");
    expect(safeRedirectPath("%2Ftiktok-live%2Fprofile")).toBe("/tiktok-live/profile");
  });
  it("falls back to / for nothing", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });
  it("refuses scripts and other sites", () => {
    for (const bad of [
      "javascript:alert(1)",
      " javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "/\t/evil.example",
      "%2F%2Fevil.example",
      "@evil.example",
      "evil.example/x",
    ]) {
      expect(safeRedirectPath(bad), bad).toBe("/");
    }
  });
});
