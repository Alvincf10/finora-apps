import { describe, expect, it, vi } from "vitest";
import { requestCached, runWithRequestCache } from "@/lib/request-cache";

describe("requestCached", () => {
  it("dedupes factory within runWithRequestCache scope", async () => {
    const factory = vi.fn(async () => 42);
    const result = await runWithRequestCache(async () => {
      const [a, b] = await Promise.all([
        requestCached("key-a", factory),
        requestCached("key-a", factory),
      ]);
      expect(a).toBe(42);
      expect(b).toBe(42);
      return factory.mock.calls.length;
    });
    expect(result).toBe(1);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("passes through outside request cache scope", async () => {
    const factory = vi.fn(async () => "x");
    const first = await requestCached("key-b", factory);
    const second = await requestCached("key-b", factory);
    expect(first).toBe("x");
    expect(second).toBe("x");
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
