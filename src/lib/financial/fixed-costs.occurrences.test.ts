import { describe, expect, it } from "vitest";
import {
  allOccurrencesInRange,
  occurrenceInRange,
} from "@/lib/financial/fixed-costs";

describe("fixed cost due-day occurrences", () => {
  it("finds due day inside a pay cycle window", () => {
    const start = new Date(2026, 9, 23); // 23 Oct
    const end = new Date(2026, 10, 24); // 24 Nov
    const due = occurrenceInRange(10, start, end);
    expect(due?.getFullYear()).toBe(2026);
    expect(due?.getMonth()).toBe(10);
    expect(due?.getDate()).toBe(10);
  });

  it("clamps day 31 into February", () => {
    const start = new Date(2026, 1, 1);
    const end = new Date(2026, 1, 28);
    const due = occurrenceInRange(31, start, end);
    expect(due?.getMonth()).toBe(1);
    expect(due?.getDate()).toBe(28);
  });

  it("lists all occurrences across a multi-month horizon", () => {
    const asOf = new Date(2026, 10, 1); // 1 Nov
    const horizon = new Date(2027, 0, 31); // 31 Jan
    const dates = allOccurrencesInRange(15, asOf, horizon);
    expect(dates.map((d) => d.getMonth())).toEqual([10, 11, 0]);
    expect(dates.every((d) => d.getDate() === 15)).toBe(true);
  });

  it("returns empty when due day never falls in range", () => {
    const start = new Date(2026, 10, 20);
    const end = new Date(2026, 10, 25);
    expect(occurrenceInRange(10, start, end)).toBeNull();
    expect(allOccurrencesInRange(10, start, end)).toEqual([]);
  });
});
