import { describe, expect, it } from "vitest";
import {
  adjustPaydayForWeekend,
  getNextPayday,
  resolvePaydayInMonth,
} from "@/lib/financial/payday";

describe("adjustPaydayForWeekend", () => {
  it("moves Sunday back to Friday", () => {
    const sun = new Date(2026, 9, 25, 15, 0, 0);
    const adj = adjustPaydayForWeekend(sun);
    expect(adj.getFullYear()).toBe(2026);
    expect(adj.getMonth()).toBe(9);
    expect(adj.getDate()).toBe(23);
  });

  it("moves Saturday back to Friday", () => {
    const sat = new Date(2026, 0, 31, 12, 0, 0);
    const adj = adjustPaydayForWeekend(sat);
    expect(adj.getDate()).toBe(30);
    expect(adj.getMonth()).toBe(0);
  });

  it("leaves weekdays unchanged at start of day", () => {
    const wed = new Date(2026, 10, 25, 23, 59, 0);
    const adj = adjustPaydayForWeekend(wed);
    expect(adj.getDate()).toBe(25);
  });
});

describe("resolvePaydayInMonth", () => {
  it("clamps payday day to 1–28 before weekend adjustment", () => {
    const low = resolvePaydayInMonth(0, 2026, 0);
    const high = resolvePaydayInMonth(31, 2026, 0);
    expect(low.getDate()).toBe(1);
    expect(high.getDate()).toBe(28);
  });

  it("applies weekend adjustment (Oct 25 2026 → Fri 23)", () => {
    const payday = resolvePaydayInMonth(25, 2026, 9);
    expect(payday.getDate()).toBe(23);
  });
});

describe("getNextPayday", () => {
  it("returns this month when still before payday", () => {
    const now = new Date(2026, 9, 10, 12, 0, 0);
    const next = getNextPayday(25, now);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(9);
    expect(next.getDate()).toBe(23);
  });

  it("returns next month after this month's payday", () => {
    const now = new Date(2026, 9, 24, 12, 0, 0);
    const next = getNextPayday(25, now);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(10);
    expect(next.getDate()).toBe(25);
  });

  it("includes payday on the same calendar day", () => {
    const now = new Date(2026, 9, 23, 8, 0, 0);
    expect(getNextPayday(25, now).getDate()).toBe(23);
  });
});
