import { describe, expect, it } from "vitest";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  it("allows up to limit within the window", () => {
    const key = `vitest-rl-allow-${Date.now()}-${Math.random()}`;
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000)).toBe(false);
  });

  it("opens a fresh bucket for a new key", () => {
    const key = `vitest-rl-fresh-${Date.now()}-${Math.random()}`;
    expect(checkRateLimit(key, 1, 60_000)).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers x-real-ip over x-forwarded-for", () => {
    const req = new Request("http://localhost/api", {
      headers: {
        "x-real-ip": " 10.0.0.5 ",
        "x-forwarded-for": "203.0.113.1, 198.51.100.2",
      },
    });
    expect(clientIp(req)).toBe("10.0.0.5");
  });

  it("uses right-most x-forwarded-for hop when x-real-ip missing", () => {
    const req = new Request("http://localhost/api", {
      headers: { "x-forwarded-for": "203.0.113.1, 198.51.100.2" },
    });
    expect(clientIp(req)).toBe("198.51.100.2");
  });

  it("returns unknown when no headers", () => {
    expect(clientIp(new Request("http://localhost/api"))).toBe("unknown");
  });
});
