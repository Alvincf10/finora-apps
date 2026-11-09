import { describe, expect, it } from "vitest";
import {
  fixedCostReminderDayKey,
  formatFixedCostDueWaText,
  isFixedCostReminderCronWindow,
  type FixedCostDueItem,
} from "@/lib/financial/fixed-cost-reminders";

const sampleItem: FixedCostDueItem = {
  fixedCostId: "fc1",
  name: "Internet",
  amount: 400_000,
  currency: "IDR",
  dueDay: 9,
};

describe("formatFixedCostDueWaText", () => {
  it("starts with Vira · and includes footer", () => {
    const text = formatFixedCostDueWaText([sampleItem]);
    expect(text.startsWith("Vira ·")).toBe(true);
    expect(text).toContain("Fixed costs");
    expect(text).toContain("Internet");
  });

  it("throws when no items", () => {
    expect(() => formatFixedCostDueWaText([])).toThrow("NO_FIXED_COSTS_DUE");
  });
});

describe("isFixedCostReminderCronWindow", () => {
  it("is true 08:00–08:04 WIB", () => {
    const inWindow = new Date("2026-11-09T01:02:00.000Z");
    expect(isFixedCostReminderCronWindow(inWindow)).toBe(true);
    const outWindow = new Date("2026-11-09T01:10:00.000Z");
    expect(isFixedCostReminderCronWindow(outWindow)).toBe(false);
  });
});

describe("fixedCostReminderDayKey", () => {
  it("formats Jakarta calendar day", () => {
    const key = fixedCostReminderDayKey(new Date("2026-11-08T20:00:00.000Z"));
    expect(key).toBe("2026-11-09");
  });
});
