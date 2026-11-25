import { describe, expect, it } from "vitest";
import { resolveManualCycleSalary } from "@/lib/financial/payday-salary";
import {
  getPayCycleBounds,
  isDueOnFollowingPayday,
  resolveAllocationDebtWindow,
  resolvePaydayTargetCycle,
} from "@/lib/financial/pay-cycle-bounds";

describe("resolveManualCycleSalary", () => {
  it("starts at 0 on fresh / reset (never Settings auto-fill)", () => {
    expect(resolveManualCycleSalary(null, false)).toBe(0);
    expect(resolveManualCycleSalary({ salary: 8_150_000 }, false)).toBe(0);
  });

  it("keeps saved manual amount when loading an existing allocation", () => {
    expect(resolveManualCycleSalary({ salary: 8_150_000 }, true)).toBe(
      8_150_000
    );
    expect(resolveManualCycleSalary({ salary: null }, true)).toBe(0);
  });
});

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
  it("extends through calendar month-end so late-month dues (kredivo 27) count", () => {
    // Cycle 25 Nov – 24 Des; kredivo due 27 Des must still be funded.
    const cycle = getPayCycleBounds(25, new Date(2026, 10, 26));
    const window = resolveAllocationDebtWindow(cycle);
    expect(window.start.getTime()).toBe(cycle.start.getTime());
    expect(window.end.getFullYear()).toBe(2026);
    expect(window.end.getMonth()).toBe(11); // Desember
    expect(window.end.getDate()).toBe(31);
  });

  it("includes Nov 27 when funding the Oct→Nov cycle", () => {
    const cycle = getPayCycleBounds(25, new Date(2026, 10, 10));
    const window = resolveAllocationDebtWindow(cycle);
    expect(cycle.end.getDate()).toBe(24);
    expect(cycle.end.getMonth()).toBe(10); // Nov
    expect(window.end.getDate()).toBe(30);
    expect(window.end.getMonth()).toBe(10);
  });
});

describe("isDueOnFollowingPayday", () => {
  it("excludes next payday dues (rupiah cepat 25 Des) from Nov paycheck", () => {
    const cycle = getPayCycleBounds(25, new Date(2026, 10, 26));
    expect(isDueOnFollowingPayday(new Date(2026, 11, 25), cycle)).toBe(true);
    expect(isDueOnFollowingPayday(new Date(2026, 11, 24), cycle)).toBe(false);
    expect(isDueOnFollowingPayday(new Date(2026, 11, 27), cycle)).toBe(false);
  });
});
