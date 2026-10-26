import { describe, expect, it } from "vitest";
import {
  buildIssueKey,
  extractEntityFromAlertId,
} from "@/lib/financial/recommendations/issue-key";
import {
  alertSeverityToPriority,
  sortActionItems,
} from "@/lib/financial/recommendations/priority";
import {
  dedupeActions,
  type ActionItem,
} from "@/lib/financial/recommendations/action-center";

describe("buildIssueKey", () => {
  it("is stable for same inputs", () => {
    const a = buildIssueKey({
      type: "BUDGET_OVERFLOW",
      categoryId: "cat1",
      period: { year: 2026, month: 10 },
    });
    const b = buildIssueKey({
      type: "BUDGET_OVERFLOW",
      categoryId: "cat1",
      period: { year: 2026, month: 10 },
    });
    expect(a).toBe(b);
    expect(a).toBe("BUDGET_OVERFLOW:cat1:2026-10");
  });

  it("differs by entity and period", () => {
    const a = buildIssueKey({
      type: "DEBT_PAYMENT_RISK",
      debtId: "d1",
      period: { year: 2026, month: 10 },
    });
    const b = buildIssueKey({
      type: "DEBT_PAYMENT_RISK",
      debtId: "d2",
      period: { year: 2026, month: 10 },
    });
    expect(a).not.toBe(b);
  });
});

describe("priority / sort", () => {
  it("maps alert severity explicitly", () => {
    expect(alertSeverityToPriority("CRITICAL")).toBe("CRITICAL");
    expect(alertSeverityToPriority("WARNING")).toBe("HIGH");
    expect(alertSeverityToPriority("INFO")).toBe("INFO");
  });

  it("sorts by priority then due date", () => {
    const sorted = sortActionItems([
      {
        priority: "LOW" as const,
        dueDate: "2026-10-01",
        evaluatedAt: "2026-10-01",
      },
      {
        priority: "CRITICAL" as const,
        dueDate: "2026-10-05",
        evaluatedAt: "2026-10-01",
      },
      {
        priority: "CRITICAL" as const,
        dueDate: "2026-10-02",
        evaluatedAt: "2026-10-01",
      },
    ]);
    expect(sorted[0].dueDate).toBe("2026-10-02");
    expect(sorted[1].dueDate).toBe("2026-10-05");
    expect(sorted[2].priority).toBe("LOW");
  });
});

describe("dedupeActions", () => {
  it("suppresses overlapping recommendation when live alert covers debt", () => {
    const items: ActionItem[] = [
      {
        id: "debt-overdue:d1",
        issueKey: "ALERT_DEBT_OVERDUE:d1:rolling",
        source: "ALERT",
        type: "ALERT_DEBT_OVERDUE",
        priority: "CRITICAL",
        title: "Overdue",
        message: "x",
      },
      {
        id: "rec1",
        issueKey: "DEBT_PAYMENT_RISK:d1:2026-10",
        source: "RECOMMENDATION",
        type: "DEBT_PAYMENT_RISK",
        priority: "HIGH",
        title: "Risk",
        message: "y",
        status: "NEW",
      },
      {
        id: "rec2",
        issueKey: "SAVINGS_OPPORTUNITY:global:2026-10",
        source: "RECOMMENDATION",
        type: "SAVINGS_OPPORTUNITY",
        priority: "LOW",
        title: "Save",
        message: "z",
        status: "NEW",
      },
    ];
    const out = dedupeActions(items);
    expect(out.map((i) => i.id)).toEqual(["debt-overdue:d1", "rec2"]);
  });
});

describe("extractEntityFromAlertId", () => {
  it("parses debt and budget ids", () => {
    expect(extractEntityFromAlertId("debt-overdue:abc").entityId).toBe("abc");
    expect(extractEntityFromAlertId("budget-over:cat9:2026-10").entityId).toBe(
      "cat9"
    );
  });
});
