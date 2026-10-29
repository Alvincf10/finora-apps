import { describe, expect, it } from "vitest";
import {
  assertSafeAiStatusPayload,
  redactSecrets,
} from "@/lib/ai/eval/redact";

describe("redact", () => {
  it("redacts openrouter-style keys", () => {
    const raw = "key=sk-or-v1-abcdefghijklmnopqrstuvwxyz123456 Bearer abc.def";
    const out = redactSecrets(raw);
    expect(out).not.toContain("sk-or-v1-");
    expect(out).toContain("[REDACTED]");
  });

  it("rejects unsafe status payloads", () => {
    expect(() =>
      assertSafeAiStatusPayload({ apiKey: "secret" })
    ).toThrow(/Unsafe/);
    expect(() =>
      assertSafeAiStatusPayload({
        configured: true,
        features: { decisionAdvisor: true },
      })
    ).not.toThrow();
  });
});