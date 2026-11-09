import { describe, expect, it } from "vitest";
import {
  alertSeverityToPriority,
  compareActionPriority,
  insightPriorityToAction,
  priorityRank,
  sortActionItems,
} from "@/lib/financial/recommendations/priority";

describe("priorityRank / compareActionPriority", () => {
  it("orders CRITICAL before INFO", () => {
    expect(priorityRank("CRITICAL")).toBeLessThan(priorityRank("INFO"));
    expect(compareActionPriority("HIGH", "MEDIUM")).toBeLessThan(0);
  });

  it("returns 99 for unknown priority", () => {
    expect(priorityRank("UNKNOWN" as "CRITICAL")).toBe(99);
  });
});

describe("alertSeverityToPriority", () => {
  it("maps severity explicitly", () => {
    expect(alertSeverityToPriority("CRITICAL")).toBe("CRITICAL");
    expect(alertSeverityToPriority("WARNING")).toBe("HIGH");
    expect(alertSeverityToPriority("INFO")).toBe("INFO");
  });
});

describe("insightPriorityToAction", () => {
  it("passes through insight levels unchanged", () => {
    expect(insightPriorityToAction("HIGH")).toBe("HIGH");
    expect(insightPriorityToAction("LOW")).toBe("LOW");
  });
});

describe("sortActionItems", () => {
  it("sorts by priority then earliest due date", () => {
    const sorted = sortActionItems([
      { priority: "LOW", dueDate: "2026-10-01" },
      { priority: "CRITICAL", dueDate: "2026-10-05" },
      { priority: "CRITICAL", dueDate: "2026-10-02" },
    ]);
    expect(sorted.map((s) => s.dueDate)).toEqual([
      "2026-10-02",
      "2026-10-05",
      "2026-10-01",
    ]);
  });

  it("breaks ties with newer evaluatedAt first", () => {
    const sorted = sortActionItems([
      {
        priority: "MEDIUM",
        dueDate: null,
        evaluatedAt: "2026-10-01T00:00:00.000Z",
      },
      {
        priority: "MEDIUM",
        dueDate: null,
        evaluatedAt: "2026-10-03T00:00:00.000Z",
      },
    ]);
    expect(sorted[0].evaluatedAt).toBe("2026-10-03T00:00:00.000Z");
  });

  it("does not mutate original array", () => {
    const orig = [{ priority: "HIGH" as const }];
    const copy = [...orig];
    sortActionItems(orig);
    expect(orig).toEqual(copy);
  });
});
