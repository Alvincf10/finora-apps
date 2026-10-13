import type { Currency } from "@/types";
import { CURRENCY_SCALE } from "@/lib/money";

/** Digits only (and one decimal point for EUR). */
export function parseCurrencyInput(
  raw: string,
  currency: Currency
): number {
  if (currency === "IDR") {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    return Number(digits);
  }

  // EUR: allow decimal comma/dot
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(",", ".");
  const parts = cleaned.split(".");
  if (parts.length === 1) return Number(parts[0] || 0);
  const whole = parts[0] || "0";
  const frac = (parts.slice(1).join("") + "00").slice(0, 2);
  return Number(`${whole}.${frac}`);
}

/** Display string for the input field (no currency symbol clutter while typing optional). */
export function formatCurrencyInput(
  value: number,
  currency: Currency
): string {
  if (!value || Number.isNaN(value)) return "";

  if (currency === "IDR") {
    return new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  }

  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Prefix label for amount fields. */
export function currencyPrefix(currency: Currency): string {
  return currency === "IDR" ? "Rp" : "€";
}

export function majorToMinor(major: number, currency: Currency): number {
  return Math.round(major * CURRENCY_SCALE[currency]);
}
