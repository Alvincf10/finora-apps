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
    ["housing", "rent", "electricity", "internet", "groceries", "food", "bills"].some(
      (k) => n.includes(k)
    )
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
