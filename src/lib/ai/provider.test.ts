import { afterEach, describe, expect, it, vi } from "vitest";
import { AIError } from "@/lib/ai/errors";
import { OpenRouterProvider } from "@/lib/ai/provider";

describe("OpenRouterProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("throws AI_NOT_CONFIGURED when API key missing", async () => {
    const provider = new OpenRouterProvider({ apiKey: "" });
    await expect(
      provider.generateText({ system: "s", prompt: "p" })
    ).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
  });

  it("maps timeout to AI_TIMEOUT", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      })
    );

    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      timeoutMs: 50,
    });

    await expect(
      provider.generateText({ system: "s", prompt: "p" })
    ).rejects.toBeInstanceOf(AIError);

    try {
      await provider.generateText({ system: "s", prompt: "p" });
    } catch (e) {
      expect((e as AIError).code).toBe("AI_TIMEOUT");
    }
  });

  it("maps 429 to AI_PROVIDER_UNAVAILABLE without leaking body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("secret-key-in-body", {
          status: 429,
          statusText: "Too Many Requests",
        })
      )
    );

    const provider = new OpenRouterProvider({ apiKey: "test-key" });
    try {
      await provider.generateText({ system: "s", prompt: "p" });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AIError);
      const err = e as AIError;
      expect(err.code).toBe("AI_PROVIDER_UNAVAILABLE");
      expect(err.message).not.toMatch(/secret-key/);
    }
  });

  it("rejects empty model content as AI_RESPONSE_INVALID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: "  " } }],
          model: "openrouter/free",
        })
      )
    );

    const provider = new OpenRouterProvider({ apiKey: "test-key" });
    await expect(
      provider.generateText({ system: "s", prompt: "p" })
    ).rejects.toMatchObject({ code: "AI_RESPONSE_INVALID" });
  });

  it("returns text and actual model on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: "Kesimpulan: cashflow ketat." } }],
          model: "some/free-model",
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        })
      )
    );

    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      model: "openrouter/free",
    });
    const result = await provider.generateText({ system: "s", prompt: "p" });
    expect(result.text).toContain("Kesimpulan");
    expect(result.model).toBe("some/free-model");
    expect(result.provider).toBe("openrouter");
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);
  });
});
