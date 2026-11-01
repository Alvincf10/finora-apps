import { describe, expect, it } from "vitest";
import { weekKeyFromBounds } from "./weekly-budget";
import { buildWeeklyCutAdvice } from "./weekly-review";

describe("weekKeyFromBounds", () => {
  it("formats Monday date as weekKey", () => {
    expect(
      weekKeyFromBounds({ year: 2026, month: 11, mondayDay: 2 })
    ).toBe("2026-11-02");
  });
});

describe("buildWeeklyCutAdvice budget target", () => {
  it("exposes nextWeekTarget used as the weekly cap as-is", () => {
    const cut = buildWeeklyCutAdvice({
      categoryName: "Food",
      weekAmount: 707_100,
      prevWeekAmount: 197_000,
      topItems: [{ label: "kopi", amount: 114_600 }],
      currency: "IDR",
    });
    expect(cut.nextWeekTarget).toBe(197_000);
    expect(cut.message).toContain("target minggu depan");
  });
});
