import { describe, expect, it } from "vitest";
import { weekKeyFromBounds } from "@/lib/financial/weekly-budget";

describe("weekKeyFromBounds", () => {
  it("pads month and monday day to two digits", () => {
    expect(
      weekKeyFromBounds({ year: 2026, month: 1, mondayDay: 5 })
    ).toBe("2026-01-05");
    expect(
      weekKeyFromBounds({ year: 2026, month: 11, mondayDay: 9 })
    ).toBe("2026-11-09");
    expect(
      weekKeyFromBounds({ year: 2025, month: 12, mondayDay: 29 })
    ).toBe("2025-12-29");
  });
});
