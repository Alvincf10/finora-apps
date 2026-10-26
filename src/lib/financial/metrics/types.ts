import type { Currency } from "@/types";

export type MetricQualityFlag =
  | "ZERO_INCOME"
  | "MIXED_CURRENCY_EXCLUDED"
  | "MISSING_BALANCE_TREATED_AS_ZERO"
  | "SHORT_HISTORY"
  | "NO_ACCOUNTS"
  | "CURRENCY_FALLBACK";

export type MetricPeriodKind = "PAY_CYCLE" | "CALENDAR_MONTH" | "CUSTOM";

export interface MetricPeriod {
  kind: MetricPeriodKind;
  year: number;
  month: number;
  label?: string;
  start?: string;
  end?: string;
}

export interface MetricValue<T = number> {
  value: T;
  unit: "MINOR" | "PERCENT" | "MONTHS" | "RATIO";
  currency?: Currency;
  available: boolean;
  sources: string[];
  assumptions: string[];
  quality: MetricQualityFlag[];
}

export interface FinancialHealthSnapshot {
  period: MetricPeriod;
  currency: Currency;
  income: MetricValue;
  expense: MetricValue;
  netCashFlow: MetricValue;
  savings: MetricValue;
  savingsRate: MetricValue<number | null>;
  totalAssets: MetricValue;
  liquidAssets: MetricValue;
  totalLiabilities: MetricValue;
  netWorth: MetricValue;
  debtPayment: MetricValue;
  debtRatio: MetricValue<number | null>;
  emergencyCoverageMonths: MetricValue<number | null>;
  quality: MetricQualityFlag[];
  rulesVersion: string;
  evaluatedAt: string;
}
