import { describe, expect, it } from "vitest";
import {
  currencyPrefix,
  formatCurrencyInput,
  majorToMinor,
  parseCurrencyInput,
} from "@/lib/currency-input";

describe("parseCurrencyInput", () => {
  it("strips non-digits for IDR", () => {
    expect(parseCurrencyInput("Rp 1.500.000", "IDR")).toBe(1_500_000);
    expect(parseCurrencyInput("", "IDR")).toBe(0);
  });

  it("parses EUR with comma or dot decimals", () => {
    expect(parseCurrencyInput("12,34", "EUR")).toBe(12.34);
    expect(parseCurrencyInput("12.3", "EUR")).toBe(12.3);
    expect(parseCurrencyInput("99", "EUR")).toBe(99);
  });
});

describe("formatCurrencyInput", () => {
  it("returns empty for zero or NaN", () => {
    expect(formatCurrencyInput(0, "IDR")).toBe("");
    expect(formatCurrencyInput(Number.NaN, "EUR")).toBe("");
  });

  it("formats IDR without decimals", () => {
    expect(formatCurrencyInput(1_500_000, "IDR")).toMatch(/1\.500\.000/);
  });

  it("formats EUR up to 2 fraction digits", () => {
    expect(formatCurrencyInput(12.3, "EUR")).toMatch(/12/);
  });
});

describe("currencyPrefix", () => {
  it("returns Rp or €", () => {
    expect(currencyPrefix("IDR")).toBe("Rp");
    expect(currencyPrefix("EUR")).toBe("€");
  });
});

describe("majorToMinor", () => {
  it("scales by currency", () => {
    expect(majorToMinor(12.34, "EUR")).toBe(1234);
    expect(majorToMinor(500_000, "IDR")).toBe(500_000);
  });
});
