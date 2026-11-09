import { describe, expect, it } from "vitest";
import { getPeriodBounds } from "@/lib/financial/summary";
import { getPayCycleForPeriod } from "@/lib/financial/pay-cycle";

describe("getPeriodBounds", () => {
  it("delegates start/end/label to pay cycle for the period", () => {
    const period = { year: 2026, month: 10 };
    const paydayDay = 25;
    const cycle = getPayCycleForPeriod(paydayDay, period);
    const bounds = getPeriodBounds(period, paydayDay);

    expect(bounds.start.getTime()).toBe(cycle.start.getTime());
    expect(bounds.end.getTime()).toBe(cycle.end.getTime());
    expect(bounds.label).toBe(cycle.label);
    expect(bounds.cycle.paydayDay).toBe(paydayDay);
  });
});
