import { describe, expect, it } from "vitest";
import {
  ALERT_INSIGHT_OVERLAP,
  alertKindToIssueType,
  buildIssueKey,
  extractEntityFromAlertId,
} from "@/lib/financial/recommendations/issue-key";

describe("buildIssueKey", () => {
  it("uses debtId over category and goal", () => {
    expect(
      buildIssueKey({
        type: "DEBT_PAYMENT_RISK",
        debtId: "d1",
        categoryId: "c1",
        goalId: "g1",
        period: { year: 2026, month: 3 },
      })
    ).toBe("DEBT_PAYMENT_RISK:d1:2026-03");
  });

  it("pads month and uses rolling when period omitted", () => {
    expect(buildIssueKey({ type: "X", categoryId: "c9" })).toBe(
      "X:c9:rolling"
    );
    expect(buildIssueKey({ type: "Y" })).toBe("Y:global:rolling");
  });

  it("appends optional suffix", () => {
    expect(
      buildIssueKey({
        type: "FIXED_COST",
        categoryId: "fc1",
        suffix: "2026-11-05",
      })
    ).toBe("FIXED_COST:fc1:rolling:2026-11-05");
  });
});

describe("extractEntityFromAlertId", () => {
  it("parses debt alert ids", () => {
    expect(extractEntityFromAlertId("debt-overdue:abc")).toEqual({
      kind: "debt-overdue",
      entityId: "abc",
    });
    expect(extractEntityFromAlertId("debt-due:abc:2026-11-01").entityId).toBe("abc");
  });

  it("parses budget and cc alerts", () => {
    expect(extractEntityFromAlertId("budget-over:cat9:2026-10")).toEqual({
      kind: "budget-over",
      entityId: "cat9",
    });
    expect(extractEntityFromAlertId("cc-warn:acc1:2026-11").entityId).toBe("acc1");
    expect(extractEntityFromAlertId("fixed:rent:2026-11-01").entityId).toBe("rent");
  });

  it("falls back for unknown shapes", () => {
    expect(extractEntityFromAlertId("weird")).toEqual({
      kind: "weird",
      entityId: null,
    });
  });
});

describe("alertKindToIssueType", () => {
  it("prefixes with ALERT_", () => {
    expect(alertKindToIssueType("debt-overdue")).toBe("ALERT_debt-overdue");
  });
});

describe("ALERT_INSIGHT_OVERLAP", () => {
  it("documents debt and budget cross-links", () => {
    expect(ALERT_INSIGHT_OVERLAP.DEBT_OVERDUE).toContain("DEBT_PAYMENT_RISK");
    expect(ALERT_INSIGHT_OVERLAP.BUDGET_OVERFLOW).toContain("OVER_BUDGET");
  });
});
