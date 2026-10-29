import { describe, expect, it } from "vitest";
import { taskTypeFromContext } from "@/lib/ai/task-types";

describe("taskTypeFromContext", () => {
  it("maps Phase 5 context types to Phase 5.1 tasks", () => {
    expect(taskTypeFromContext("financial_health")).toBe("financial_explainer");
    expect(taskTypeFromContext("cash_flow_forecast")).toBe(
      "financial_explainer"
    );
    expect(taskTypeFromContext("roadmap")).toBe("financial_explainer");
    expect(taskTypeFromContext("scenario")).toBe("financial_reasoning");
    expect(taskTypeFromContext("decision_advisor")).toBe("financial_reasoning");
    expect(taskTypeFromContext("action_center")).toBe("action_advisor");
    expect(taskTypeFromContext("general_summary")).toBe("general_explainer");
  });

  it("honors explicit simple_summary opt-in", () => {
    expect(
      taskTypeFromContext("general_summary", { simpleSummary: true })
    ).toBe("simple_summary");
  });
});
