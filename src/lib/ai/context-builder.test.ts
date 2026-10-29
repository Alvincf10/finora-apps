import { describe, expect, it } from "vitest";
import { AI_CONTEXT_TYPES } from "@/lib/ai/context-builder";
import { aiExplainSchema } from "@/lib/validations";

describe("AI explain schema + context types", () => {
  it("accepts all PRD context types", () => {
    for (const contextType of AI_CONTEXT_TYPES) {
      const parsed = aiExplainSchema.parse({
        question: "Mengapa kondisi saya seperti ini?",
        contextType,
      });
      expect(parsed.contextType).toBe(contextType);
    }
  });

  it("rejects unknown contextType", () => {
    expect(() =>
      aiExplainSchema.parse({
        question: "test",
        contextType: "invented",
      })
    ).toThrow();
  });

  it("rejects empty question", () => {
    expect(() =>
      aiExplainSchema.parse({
        question: "",
        contextType: "general_summary",
      })
    ).toThrow();
  });

  it("accepts scenario contextRef", () => {
    const parsed = aiExplainSchema.parse({
      question: "Bandingkan skenario ini",
      contextType: "scenario",
      contextRef: { scenarioId: "abc123" },
    });
    expect(parsed.contextRef?.scenarioId).toBe("abc123");
  });

  it("accepts decision_advisor with preference override", () => {
    const parsed = aiExplainSchema.parse({
      question: "Mana yang lebih sesuai?",
      contextType: "decision_advisor",
      contextRef: {
        decisionPreference: "LIQUIDITY",
        scenarioIds: ["a", "b"],
      },
    });
    expect(parsed.contextType).toBe("decision_advisor");
    expect(parsed.contextRef?.decisionPreference).toBe("LIQUIDITY");
  });
});
