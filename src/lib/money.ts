import type { Currency } from "@/types";

/** Minor units: IDR has none (1), EUR uses cents (100). */
export const CURRENCY_SCALE: Record<Currency, number> = {
  IDR: 1,
  EUR: 100,
};

export function toMinorUnits(
  majorAmount: number,
  currency: Currency
): number {
  const scale = CURRENCY_SCALE[currency];
  return Math.round(majorAmount * scale);
}

export function fromMinorUnits(
  minorAmount: number,
  currency: Currency
): number {
  const scale = CURRENCY_SCALE[currency];
  return minorAmount / scale;
}

export function assertPositiveAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive integer in minor units");
  }
}

export function formatMoney(
  amountMinor: number,
  currency: Currency,
  locale = "id-ID"
): string {
  const major = fromMinorUnits(amountMinor, currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "IDR" ? 0 : 2,
  }).format(major);
}

export function addMoney(a: number, b: number): number {
  return a + b;
}

export function subtractMoney(a: number, b: number): number {
  return a - b;
}

export function percent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}
