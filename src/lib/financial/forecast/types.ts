import type { Currency } from "@/types";

export type ForecastHorizonDays = 30 | 60 | 90;

export type ForecastEventKind =
  | "INCOME"
  | "FIXED_COST"
  | "DEBT"
  | "VARIABLE_SPEND";

/** How income was classified — never silently merged (FR-02.2). */
export type ForecastIncomeClass =
  | "SCHEDULED_SALARY"
  | "HISTORICAL_AVERAGE"
  | "USER_ASSUMPTION"
  | "NONE";

export type ForecastEvent = {
  id: string;
  /** Calendar date YYYY-MM-DD in local evaluation timezone semantics. */
  date: string;
  kind: ForecastEventKind;
  /** Always positive minor units; direction decides sign. */
  amount: number;
  direction: "IN" | "OUT";
  label: string;
  source: string;
  linkedId?: string;
  incomeClass?: ForecastIncomeClass;
};

export type ForecastBalancePoint = {
  date: string;
  balance: number;
  eventIds: string[];
};

export type CashShortfall = {
  date: string;
  balanceAfter: number;
  causingEventId: string;
  causingLabel: string;
  causingKind: ForecastEventKind;
  amount: number;
};

export type HorizonCashFlowForecast = {
  currency: Currency;
  horizonDays: ForecastHorizonDays;
  asOf: string;
  horizonEnd: string;
  startingBalance: number;
  endingBalance: number;
  lowestBalance: number;
  lowestBalanceDate: string | null;
  totalInflows: number;
  totalOutflows: number;
  netCashFlow: number;
  incomeClass: ForecastIncomeClass;
  events: ForecastEvent[];
  series: ForecastBalancePoint[];
  shortfalls: CashShortfall[];
  assumptions: string[];
  limitations: string[];
  /** Optional: current pay-cycle actual vs rule-based projection for same window. */
  cycleComparison: {
    cycleLabel: string;
    actualIncome: number;
    actualExpense: number;
    actualNet: number;
    projectedIncome: number;
    projectedExpense: number;
    projectedNet: number;
  } | null;
  allocatedCash: number | null;
  unallocatedHint: number | null;
  rulesVersion: string;
  evaluatedAt: string;
};
