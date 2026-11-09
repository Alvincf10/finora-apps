import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/client-api";

describe("api client helper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns data on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ success: true, data: { ok: 1 } }),
      })
    );
    await expect(api<{ ok: number }>("/api/x")).resolves.toEqual({ ok: 1 });
  });

  it("throws error.message on failure payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: false,
          error: { code: "X", message: "boom" },
        }),
      })
    );
    await expect(api("/api/x")).rejects.toThrow("boom");
  });
});
