import { describe, expect, it } from "vitest";
import {
  changePercent,
  formatChangePct,
  formatExpenseWowWaLabel,
} from "@/lib/financial/change-pct";

describe("changePercent", () => {
  it("returns rounded percent vs previous", () => {
    expect(changePercent(120, 100)).toBe(20);
    expect(changePercent(80, 100)).toBe(-20);
  });

  it("returns null when previous is zero or negative", () => {
    expect(changePercent(100, 0)).toBeNull();
    expect(changePercent(100, -5)).toBeNull();
  });

  it("caps magnitude at 999", () => {
    expect(changePercent(10_000, 1)).toBe(999);
    expect(changePercent(0, 1)).toBe(-100);
    expect(changePercent(-20_000, 100)).toBe(-999);
  });

  it("uses money.percent rounding (2 decimals then round)", () => {
    expect(changePercent(133, 100)).toBe(33);
    expect(changePercent(150, 100)).toBe(50);
  });
});

describe("formatChangePct", () => {
  it('returns "baru" for null baseline', () => {
    expect(formatChangePct(null)).toBe("baru");
  });

  it("prefixes positive changes with +", () => {
    expect(formatChangePct(12)).toBe("+12%");
    expect(formatChangePct(0)).toBe("0%");
  });

  it("leaves negative values unsigned minus via number", () => {
    expect(formatChangePct(-5)).toBe("-5%");
  });
});

describe("formatExpenseWowWaLabel", () => {
  it("explains drop as more frugal", () => {
    expect(formatExpenseWowWaLabel(-22)).toBe(
      "turun 22% vs minggu lalu · lebih hemat"
    );
  });

  it("explains rise as higher spend", () => {
    expect(formatExpenseWowWaLabel(15)).toBe(
      "naik 15% vs minggu lalu · lebih boros"
    );
  });

  it("handles flat and missing baseline", () => {
    expect(formatExpenseWowWaLabel(0)).toBe("sama seperti minggu lalu");
    expect(formatExpenseWowWaLabel(null)).toBe(
      "vs minggu lalu: belum ada data"
    );
  });
});
