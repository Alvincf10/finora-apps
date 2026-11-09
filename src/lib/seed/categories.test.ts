import { describe, expect, it } from "vitest";
import { SYSTEM_CATEGORIES, categoryMeta } from "@/lib/seed/categories";

describe("SYSTEM_CATEGORIES", () => {
  it("has name, type, and icon on every row", () => {
    for (const row of SYSTEM_CATEGORIES) {
      expect(row.name).toBeTruthy();
      expect(["INCOME", "EXPENSE"]).toContain(row.type);
      expect(row.icon).toBeTruthy();
    }
  });

  it("includes Food with child labels", () => {
    const food = SYSTEM_CATEGORIES.find((c) => c.name === "Food");
    expect(food?.type).toBe("EXPENSE");
    expect(food && "children" in food && food.children).toEqual(
      expect.arrayContaining(["Groceries", "Coffee", "Delivery"])
    );
  });
});

describe("categoryMeta", () => {
  it("returns UNKNOWN for income", () => {
    expect(categoryMeta("Salary", "INCOME")).toEqual({
      classification: "UNKNOWN",
      nature: "UNKNOWN",
    });
  });

  it("classifies Food and Debt Payment", () => {
    expect(categoryMeta("Food", "EXPENSE")).toEqual({
      classification: "ESSENTIAL",
      nature: "VARIABLE",
    });
    expect(categoryMeta("Debt Payment", "EXPENSE")).toEqual({
      classification: "IMPORTANT",
      nature: "VARIABLE",
    });
  });
});
