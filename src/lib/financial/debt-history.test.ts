import { describe, expect, it } from "vitest";
import {
  groupDebtHistoryByMonth,
  sortDebtHistoryNewestFirst,
  sumDebtHistoryMonthTotals,
} from "@/lib/financial/debt-history";

describe("sortDebtHistoryNewestFirst", () => {
  it("orders by sortAt descending", () => {
    const sorted = sortDebtHistoryNewestFirst([
      { id: "a", sortAt: "2026-10-23T00:00:00.000Z" },
      { id: "b", sortAt: "2026-11-25T07:11:49.000Z" },
      { id: "c", sortAt: "2026-11-25T07:11:56.000Z" },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
});

describe("groupDebtHistoryByMonth", () => {
  it("groups newest month first and keeps newest-paid order inside", () => {
    const groups = groupDebtHistoryByMonth(
      [
        { id: "oct", sortAt: "2026-10-23T00:00:00.000Z" },
        { id: "nov-early", sortAt: "2026-11-25T07:11:49.000Z" },
        { id: "nov-late", sortAt: "2026-11-25T07:20:00.000Z" },
      ],
      "id-ID"
    );

    expect(groups.map((g) => g.key)).toEqual(["2026-11", "2026-10"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["nov-late", "nov-early"]);
    expect(groups[0].label.toLowerCase()).toContain("2026");
  });
});

describe("sumDebtHistoryMonthTotals", () => {
  it("sums original amounts per currency", () => {
    expect(
      sumDebtHistoryMonthTotals([
        { originalAmount: 100_000, currency: "IDR" },
        { originalAmount: 250_000, currency: "IDR" },
        { originalAmount: 50, currency: "EUR" },
      ])
    ).toEqual([
      { currency: "IDR", total: 350_000 },
      { currency: "EUR", total: 50 },
    ]);
  });
});
