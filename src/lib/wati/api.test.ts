import { describe, expect, it } from "vitest";
import { cleanEndpoint, cleanToken, newWebhookKey } from "./api";

describe("cleanEndpoint", () => {
  it("keeps the tenant URL and drops any API tail", () => {
    expect(cleanEndpoint("https://live-mt-server.wati.io/123456")).toBe("https://live-mt-server.wati.io/123456");
    expect(cleanEndpoint(" https://live-mt-server.wati.io/123456/ ")).toBe("https://live-mt-server.wati.io/123456");
    expect(cleanEndpoint("https://live-mt-server.wati.io/123456/api/v1/getContacts")).toBe("https://live-mt-server.wati.io/123456");
    expect(cleanEndpoint("https://app-server.wati.io")).toBe("https://app-server.wati.io");
  });

  it("refuses anything that isn't WATI over https", () => {
    expect(cleanEndpoint("http://live-mt-server.wati.io/1")).toBeNull();
    expect(cleanEndpoint("https://evil.example.com/wati.io")).toBeNull();
    expect(cleanEndpoint("https://wati.io.evil.com/1")).toBeNull();
    expect(cleanEndpoint("not a url")).toBeNull();
    expect(cleanEndpoint(undefined)).toBeNull();
  });
});

describe("cleanToken", () => {
  it("strips a pasted Bearer prefix", () => {
    expect(cleanToken("Bearer eyJhbGciOiJIUzI1NiJ9.x.y")).toBe("eyJhbGciOiJIUzI1NiJ9.x.y");
    expect(cleanToken("  eyJhbGciOiJIUzI1NiJ9.x.y ")).toBe("eyJhbGciOiJIUzI1NiJ9.x.y");
  });

  it("rejects empty or junk", () => {
    expect(cleanToken("")).toBeNull();
    expect(cleanToken("Bearer ")).toBeNull();
    expect(cleanToken(42)).toBeNull();
  });
});

describe("newWebhookKey", () => {
  it("is long, URL-safe and different every time", () => {
    const a = newWebhookKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newWebhookKey()).not.toBe(a);
  });
});
