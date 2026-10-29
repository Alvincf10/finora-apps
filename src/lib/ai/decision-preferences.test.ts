import { describe, expect, it } from "vitest";
import {
  DECISION_PREFERENCES,
  isDecisionPreference,
} from "@/lib/ai/decision-preferences";
import { taskTypeFromContext } from "@/lib/ai/task-types";
import { AI_CONTEXT_TYPES } from "@/lib/ai/context-builder";
import { aiExplainSchema } from "@/lib/validations";
import { assertSafeAiStatusPayload } from "@/lib/ai/eval/redact";

describe("Decision Advisor preference + context (5.2-G-E)", () => {
  it("accepts only explicit preference enums", () => {
    for (const p of DECISION_PREFERENCES) {
      expect(isDecisionPreference(p)).toBe(true);
    }
    expect(isDecisionPreference("MAKE_ME_RICH")).toBe(false);
    expect(isDecisionPreference("")).toBe(false);
  });

  it("maps decision_advisor to financial_reasoning", () => {
    expect(taskTypeFromContext("decision_advisor")).toBe("financial_reasoning");
  });

  it("includes decision_advisor in AI_CONTEXT_TYPES", () => {
    expect(AI_CONTEXT_TYPES).toContain("decision_advisor");
  });

  it("explain schema accepts DA preference + scenarios", () => {
    const parsed = aiExplainSchema.parse({
      question: "Mana yang lebih sesuai?",
      contextType: "decision_advisor",
      contextRef: {
        decisionPreference: "DEBT_PAYOFF",
        scenarioIds: ["a", "b"],
      },
    });
    expect(parsed.contextRef?.decisionPreference).toBe("DEBT_PAYOFF");
  });

  it("status-shaped payload stays free of secrets", () => {
    assertSafeAiStatusPayload({
      configured: true,
      features: {
        scenarioExplainer: true,
        decisionAdvisor: true,
        routerEnabled: false,
      },
      baselineModel: "nvidia/nemotron-3.5-lightning:free",
    });
  });
});
