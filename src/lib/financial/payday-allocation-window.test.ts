import { describe, expect, it } from "vitest";
import {
  getPayCycleBounds,
  resolveAllocationDebtWindow,
  resolvePaydayTargetCycle,
} from "@/lib/financial/pay-cycle-bounds";

describe("resolvePaydayTargetCycle", () => {
  it("defaults to next mid-cycle (prepare upcoming paycheck)", () => {
    const mid = new Date(2026, 10, 15);
    const resolved = resolvePaydayTargetCycle(25, mid, "auto");
    expect(resolved.target).toBe("next");
    expect(resolved.cycle.label).toContain("Nov");
    expect(resolved.currentCycle.label).toContain("Okt");
  });

  it("stays on current on the payday that starts the cycle", () => {
    const payday = new Date(2026, 9, 23, 12);
    const resolved = resolvePaydayTargetCycle(25, payday, "auto");
    expect(resolved.target).toBe("current");
    expect(resolved.cycle.start.getDate()).toBe(23);
  });

  it("honors explicit current / next preference", () => {
    const mid = new Date(2026, 10, 15);
    expect(resolvePaydayTargetCycle(25, mid, "current").target).toBe("current");
    expect(resolvePaydayTargetCycle(25, mid, "next").target).toBe("next");
  });
});

describe("resolveAllocationDebtWindow", () => {
  it("uses the target cycle bounds only (no spill into following payday)", () => {
    const cycle = getPayCycleBounds(25, new Date(2026, 10, 26));
    const window = resolveAllocationDebtWindow(cycle);
    expect(window.start.getTime()).toBe(cycle.start.getTime());
    expect(window.end.getTime()).toBe(cycle.end.getTime());
    expect(window.end.getDate()).toBe(24);
    expect(window.end.getMonth()).toBe(11);
  });
});
