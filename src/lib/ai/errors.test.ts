import { describe, expect, it } from "vitest";
import { AIError, isAIError } from "@/lib/ai/errors";

describe("AIError", () => {
  it("carries code, message, and status", () => {
    const err = new AIError("AI_TIMEOUT", "slow", 504);
    expect(err.name).toBe("AIError");
    expect(err.code).toBe("AI_TIMEOUT");
    expect(err.message).toBe("slow");
    expect(err.status).toBe(504);
  });
});

describe("isAIError", () => {
  it("narrows AIError instances", () => {
    const err = new AIError("AI_NOT_CONFIGURED", "no key");
    expect(isAIError(err)).toBe(true);
    expect(isAIError(new Error("x"))).toBe(false);
  });
});
