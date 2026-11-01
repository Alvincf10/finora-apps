import { percent } from "@/lib/money";
import type {
  CashFlowForecast,
  CategoryMonthlySpend,
  Confidence,
  DebtScenario,
  ExpenseClass,
  InsightRecommendation,
  Period,
  TrendDirection,
  WhatIfInput,
  WhatIfResult,
} from "@/lib/financial/phase2-types";
import type { Currency } from "@/types";

export function weightedAverage3(amountsNewestFirst: number[]): number {
  if (amountsNewestFirst.length === 0) return 0;
  const [m1 = 0, m2 = 0, m3 = 0] = amountsNewestFirst;
  if (amountsNewestFirst.length === 1) return Math.round(m1);
  if (amountsNewestFirst.length === 2) {
    return Math.round(m1 * 0.6 + m2 * 0.4);
  }
  return Math.round(m1 * 0.5 + m2 * 0.3 + m3 * 0.2);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Average of strictly positive values only (skips empty months / zero samples). */
export function meanPositive(values: number[]): number {
  const positive = values.filter((v) => v > 0);
  if (positive.length === 0) return 0;
  return mean(positive);
}

export function countPositive(values: number[]): number {
  return values.filter((v) => v > 0).length;
}

/**
 * Guard noisy "income changed vs average" insights when history is thin
 * or diluted by empty months / first-time logging.
 */
export function shouldFlagIncomeChange(input: {
  currentIncome: number;
  averageIncome: number;
  positiveHistoryMonths: number;
  monthlySalary?: number;
  thresholdPercent?: number;
}): boolean {
  const {
    currentIncome,
    averageIncome,
    positiveHistoryMonths,
    monthlySalary = 0,
    thresholdPercent = 15,
  } = input;
  if (currentIncome <= 0 || averageIncome <= 0) return false;
  if (positiveHistoryMonths < 2) return false;

  // History still tiny vs configured salary → not a meaningful "usual" baseline.
  if (monthlySalary > 0 && averageIncome < monthlySalary * 0.5) return false;

  // Current close to salary while history is sparse → first real payday, not a spike.
  if (
    monthlySalary > 0 &&
    positiveHistoryMonths < 3 &&
    Math.abs(currentIncome - monthlySalary) / monthlySalary <= 0.2
  ) {
    return false;
  }

  const changePercent = Math.abs(
    ((currentIncome - averageIncome) / averageIncome) * 100
  );
  return changePercent >= thresholdPercent;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function detectSpendingTrend(
  currentAmount: number,
  historicalAmounts: number[],
  threshold = 0.1
): {
  trend: TrendDirection;
  historicalAverage: number;
  percentageChange: number;
  confidence: Confidence;
} {
  if (historicalAmounts.length < 2) {
    return {
      trend: "INSUFFICIENT_DATA",
      historicalAverage: mean(historicalAmounts),
      percentageChange: 0,
      confidence: "LOW",
    };
  }

  const historicalAverage = mean(historicalAmounts);
  const percentageChange = percent(
    currentAmount - historicalAverage,
    historicalAverage
  );
  const ratio =
    historicalAverage === 0
      ? currentAmount > 0
        ? 1
        : 0
      : (currentAmount - historicalAverage) / historicalAverage;

  let trend: TrendDirection = "STABLE";
  if (ratio > threshold) trend = "INCREASING";
  else if (ratio < -threshold) trend = "DECREASING";

  const confidence: Confidence =
    historicalAmounts.length >= 6
      ? "HIGH"
      : historicalAmounts.length >= 3
        ? "MEDIUM"
        : "LOW";

  return {
    trend,
    historicalAverage: Math.round(historicalAverage),
    percentageChange,
    confidence,
  };
}

export function detectAnomaly(
  currentAmount: number,
  historicalAmounts: number[]
): { isAnomaly: boolean; reason: string; average: number; threshold: number } {
  const positiveHistory = historicalAmounts.filter((a) => a > 0);

  // Need a real baseline — zero-padded months must not flag first spends.
  if (positiveHistory.length < 2) {
    return {
      isAnomaly: false,
      reason: "Insufficient historical periods",
      average: Math.round(mean(positiveHistory)),
      threshold: 0,
    };
  }

  const average = mean(positiveHistory);
  if (average <= 0) {
    return {
      isAnomaly: false,
      reason: "No historical baseline",
      average: 0,
      threshold: 0,
    };
  }

  const sd = stdDev(positiveHistory);
  const threshold = sd > 0 ? average + 2 * sd : average * 1.5;
  const isAnomaly = currentAmount > threshold;

  return {
    isAnomaly,
    reason: isAnomaly
      ? sd > 0
        ? "Above mean + 2σ"
        : "Above 1.5× historical average"
      : "Within expected range",
    average: Math.round(average),
    threshold: Math.round(threshold),
  };
}

export function projectCategorySpend(
  spentSoFar: number,
  dayOfMonth: number,
  daysInMonth: number
): number {
  if (dayOfMonth <= 0) return spentSoFar;
  return Math.round((spentSoFar / dayOfMonth) * daysInMonth);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function calculateEmergencyCoverage(
  emergencyFund: number,
  essentialMonthlyExpenses: number
): number | null {
  if (essentialMonthlyExpenses <= 0) return null;
  return Math.round((emergencyFund / essentialMonthlyExpenses) * 100) / 100;
}

export function calculateDebtScenario(
  balance: number,
  monthlyPayment: number,
  annualInterestRate?: number | null
): DebtScenario {
  if (monthlyPayment <= 0 || balance <= 0) {
    return {
      label: "Invalid",
      monthlyPayment,
      estimatedMonths: null,
      totalPayment: null,
      estimatedInterest: null,
      note: "Payment or balance invalid",
    };
  }

  if (annualInterestRate == null) {
    const months = Math.ceil(balance / monthlyPayment);
    return {
      label: `${monthlyPayment}`,
      monthlyPayment,
      estimatedMonths: months,
      totalPayment: months * monthlyPayment,
      estimatedInterest: null,
      note: "Interest calculation unavailable (rate missing).",
    };
  }

  const r = annualInterestRate / 100 / 12;
  if (r === 0) {
    const months = Math.ceil(balance / monthlyPayment);
    return {
      label: `${monthlyPayment}`,
      monthlyPayment,
      estimatedMonths: months,
      totalPayment: months * monthlyPayment,
      estimatedInterest: 0,
    };
  }

  // if payment too small to cover interest
  if (monthlyPayment <= balance * r) {
    return {
      label: `${monthlyPayment}`,
      monthlyPayment,
      estimatedMonths: null,
      totalPayment: null,
      estimatedInterest: null,
      note: "Payment does not cover interest; payoff not reachable.",
    };
  }

  const months = Math.ceil(
    Math.log(monthlyPayment / (monthlyPayment - balance * r)) / Math.log(1 + r)
  );
  const totalPayment = months * monthlyPayment;
  return {
    label: `${monthlyPayment}`,
    monthlyPayment,
    estimatedMonths: months,
    totalPayment,
    estimatedInterest: totalPayment - balance,
  };
}

export function forecastMonthlyCashflow(input: {
  projectedIncome: number;
  projectedExpenses: number;
  projectedFixedCosts?: number;
  projectedDebtPayment: number;
  startingBalance: number;
  currency: Currency;
  historicalMonthsAvailable: number;
  incomeStable: boolean;
  incomeSource?: CashFlowForecast["incomeSource"];
  assumptions?: string[];
}): CashFlowForecast {
  const projectedSavings =
    input.projectedIncome -
    input.projectedExpenses -
    input.projectedDebtPayment;
  const projectedEndingBalance = input.startingBalance + projectedSavings;
  const incomeSource = input.incomeSource ?? "HISTORY";

  let confidence: Confidence = "LOW";
  if (
    (input.historicalMonthsAvailable >= 6 && input.incomeStable) ||
    (incomeSource === "SALARY" && input.historicalMonthsAvailable >= 3)
  ) {
    confidence = "HIGH";
  } else if (
    input.historicalMonthsAvailable >= 3 ||
    incomeSource === "SALARY"
  ) {
    confidence = "MEDIUM";
  }

  return {
    projectedIncome: input.projectedIncome,
    projectedExpenses: input.projectedExpenses,
    projectedFixedCosts: input.projectedFixedCosts ?? 0,
    projectedDebtPayment: input.projectedDebtPayment,
    projectedSavings,
    startingBalance: input.startingBalance,
    projectedEndingBalance,
    assumptions: input.assumptions ?? [
      "Forecast assumes spending remains similar to the previous 3 months (weighted).",
      "Debt payment uses planned/minimum obligation.",
      "Transfers are excluded from expenses.",
    ],
    confidence,
    currency: input.currency,
    incomeSource,
  };
}

export function runWhatIf(
  baseline: {
    income: number;
    expenses: number;
    debtPayment: number;
    savings: number;
    debtBalance: number;
    debtInterestRate?: number | null;
  },
  scenario: WhatIfInput
): WhatIfResult {
  const income = scenario.incomeOverride ?? baseline.income;
  const expenseDelta =
    scenario.expenseOverrides?.reduce((sum, e) => sum + e.amount, 0) ??
    baseline.expenses;
  const expenses =
    scenario.expenseOverrides != null ? expenseDelta : baseline.expenses;
  const debtPayment = scenario.debtPaymentOverride ?? baseline.debtPayment;
  const savings =
    scenario.savingsOverride ??
    income - expenses - debtPayment;
  const cashFlow = income - expenses - debtPayment;
  const endingBalance = cashFlow;

  const payoff = calculateDebtScenario(
    baseline.debtBalance,
    debtPayment,
    baseline.debtInterestRate
  );

  return {
    cashFlow,
    savings,
    debtPayoffMonths: payoff.estimatedMonths,
    endingBalance,
    assumptions: [
      "Simulation only — does not mutate transactions or budgets.",
      "Expense overrides replace total expenses when provided.",
    ],
  };
}

export function defaultClassification(name: string): ExpenseClass {
  const n = name.toLowerCase();
  if (
    [
      "housing",
      "rent",
      "electricity",
      "internet",
      "groceries",
      "food",
      "bills",
      "transport",
      "flazz",
      "fuel",
    ].some((k) => n.includes(k))
  ) {
    return "ESSENTIAL";
  }
  if (
    [
      "coffee",
      "shopping",
      "entertainment",
      "travel",
      "subscription",
      "lifestyle",
      "relationship",
    ].some((k) => n.includes(k))
  ) {
    return "DISCRETIONARY";
  }
  if (n.includes("debt") || n.includes("savings")) return "IMPORTANT";
  return "UNKNOWN";
}

export function defaultNature(name: string, classification: ExpenseClass): "FIXED" | "VARIABLE" | "UNKNOWN" {
  const n = name.toLowerCase();
  if (
    ["rent", "internet", "subscription", "insurance", "electricity"].some((k) =>
      n.includes(k)
    )
  ) {
    return "FIXED";
  }
  if (classification === "ESSENTIAL" && n.includes("housing")) return "FIXED";
  if (classification === "UNKNOWN") return "UNKNOWN";
  return "VARIABLE";
}

/** Categories safe to suggest cutting when cash flow is negative. */
export function isCuttableCategory(
  name: string,
  classification: string,
  nature: string
): boolean {
  const n = name.toLowerCase();
  if (nature === "FIXED") return false;
  if (classification === "IMPORTANT") return false;
  if (classification === "ESSENTIAL") return false;
  if (
    ["debt", "utang", "savings", "tabungan", "rent", "housing", "cicilan"].some(
      (k) => n.includes(k)
    )
  ) {
    return false;
  }
  return classification === "DISCRETIONARY" || classification === "UNKNOWN";
}

export type CashflowCutCandidate = {
  categoryId: string;
  categoryName: string;
  currentAmount: number;
  classification: string;
  nature: string;
};

export type CashflowCutSuggestion = {
  categoryId: string;
  categoryName: string;
  currentAmount: number;
  suggestedCut: number;
  classification: string;
};

function cutMaterialFloor(currency: Currency): number {
  return currency === "IDR" ? 25_000 : 250;
}

function maxCutShare(classification: string): number {
  return classification === "DISCRETIONARY" ? 0.6 : 0.4;
}

function cutPriority(classification: string): number {
  if (classification === "DISCRETIONARY") return 0;
  if (classification === "UNKNOWN") return 1;
  return 2;
}

/**
 * Allocate a cash-flow deficit across the largest cuttable categories.
 * Pure / deterministic — same inputs → same suggestions.
 */
export function suggestCashflowCuts(input: {
  deficit: number;
  categories: CashflowCutCandidate[];
  currency?: Currency;
  maxSuggestions?: number;
}): {
  suggestions: CashflowCutSuggestion[];
  coveredAmount: number;
  remainingDeficit: number;
} {
  const deficit = Math.max(0, Math.round(input.deficit));
  const maxSuggestions = input.maxSuggestions ?? 3;
  const currency = input.currency ?? "IDR";
  const floor = cutMaterialFloor(currency);

  if (deficit <= 0) {
    return { suggestions: [], coveredAmount: 0, remainingDeficit: 0 };
  }

  const candidates = input.categories
    .filter(
      (c) =>
        c.currentAmount >= floor &&
        isCuttableCategory(c.categoryName, c.classification, c.nature)
    )
    .map((c) => ({
      ...c,
      maxCut: Math.max(
        0,
        Math.floor(c.currentAmount * maxCutShare(c.classification))
      ),
    }))
    .filter((c) => c.maxCut >= floor)
    .sort((a, b) => {
      const p = cutPriority(a.classification) - cutPriority(b.classification);
      if (p !== 0) return p;
      return b.currentAmount - a.currentAmount;
    });

  const suggestions: CashflowCutSuggestion[] = [];
  let remaining = deficit;

  for (const c of candidates) {
    if (suggestions.length >= maxSuggestions || remaining < floor) break;
    const cut = Math.min(remaining, c.maxCut);
    if (cut < floor) continue;
    suggestions.push({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      currentAmount: c.currentAmount,
      suggestedCut: cut,
      classification: c.classification,
    });
    remaining -= cut;
  }

  const coveredAmount = deficit - remaining;
  return {
    suggestions,
    coveredAmount,
    remainingDeficit: Math.max(0, remaining),
  };
}

export function buildCashflowCutMessage(input: {
  deficit: number;
  currency: Currency;
  suggestions: CashflowCutSuggestion[];
  remainingDeficit: number;
  formatMoney: (amount: number, currency: Currency) => string;
}): string {
  const { deficit, currency, suggestions, remainingDeficit, formatMoney } =
    input;
  const deficitLabel = formatMoney(deficit, currency);

  if (suggestions.length === 0) {
    return `Pengeluaran melebihi pemasukan ${deficitLabel}. Sebagian besar keluar ke fixed/essential — tinjau cicilan, fixed costs, atau cari tambahan pemasukan.`;
  }

  const parts = suggestions.map(
    (s) => `${s.categoryName} ~${formatMoney(s.suggestedCut, currency)}`
  );
  let message = `Pengeluaran melebihi pemasukan ${deficitLabel}. Coba kurangi: ${parts.join(", ")}.`;
  if (remainingDeficit >= cutMaterialFloor(currency)) {
    message += ` Masih kurang ~${formatMoney(remainingDeficit, currency)} — cek juga tagihan/cicilan.`;
  }
  return message;
}

export function buildInsightFromTrend(
  categoryId: string,
  categoryName: string,
  current: number,
  average: number,
  changePercent: number,
  period: Period
): InsightRecommendation | null {
  if (Math.abs(changePercent) < 10) return null;
  if (changePercent >= 10) {
    return {
      type: "SPENDING_INCREASE",
      priority: changePercent >= 25 ? "HIGH" : "MEDIUM",
      title: `Belanja ${categoryName} naik`,
      message: `Belanja ${categoryName} ${changePercent}% di atas rata-rata historismu.`,
      categoryId,
      currentValue: current,
      recommendedValue: average,
      difference: current - average,
      evidence: [
        {
          metric: `${categoryName.toLowerCase()}_spending`,
          current,
          average3m: average,
          changePercent,
        },
      ],
      actionType: "VIEW_SPENDING",
      period,
    };
  }
  return {
    type: "SPENDING_DECREASE",
    priority: "LOW",
    title: `Belanja ${categoryName} turun`,
    message: `Belanja ${categoryName} ${Math.abs(changePercent)}% di bawah rata-rata historismu.`,
    categoryId,
    currentValue: current,
    recommendedValue: average,
    difference: current - average,
    evidence: [
      {
        metric: `${categoryName.toLowerCase()}_spending`,
        current,
        average3m: average,
        changePercent,
      },
    ],
    actionType: "VIEW_SPENDING",
    period,
  };
}
