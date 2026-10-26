import { describe, expect, it } from "vitest";
import {
  addMoney,
  CURRENCY_SCALE,
  fromMinorUnits,
  percent,
  subtractMoney,
  toMinorUnits,
} from "@/lib/money";

describe("money precision", () => {
  it("uses scale 1 for IDR and 100 for EUR", () => {
    expect(CURRENCY_SCALE.IDR).toBe(1);
    expect(CURRENCY_SCALE.EUR).toBe(100);
  });

  it("converts EUR majors to cents without float drift on common values", () => {
    expect(toMinorUnits(12.34, "EUR")).toBe(1234);
    expect(fromMinorUnits(1234, "EUR")).toBe(12.34);
  });

  it("keeps IDR as whole rupiah", () => {
    expect(toMinorUnits(1_500_000, "IDR")).toBe(1_500_000);
    expect(fromMinorUnits(1_500_000, "IDR")).toBe(1_500_000);
  });

  it("adds and subtracts as integers", () => {
    expect(addMoney(100, 50)).toBe(150);
    expect(subtractMoney(100, 50)).toBe(50);
  });

  it("percent returns 0 when denominator is 0 (legacy helper)", () => {
    expect(percent(50, 0)).toBe(0);
  });

  it("percent rounds to 2 decimal places", () => {
    expect(percent(1, 3)).toBe(33.33);
  });
});
