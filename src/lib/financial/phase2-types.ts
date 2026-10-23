import type { Currency } from "@/types";

export type ExpenseClass =
  | "ESSENTIAL"
  | "IMPORTANT"
  | "DISCRETIONARY"
  | "UNKNOWN";

export type ExpenseNature = "FIXED" | "VARIABLE" | "UNKNOWN";

export type TrendDirection =
  | "INCREASING"
  | "DECREASING"
  | "STABLE"
  | "INSUFFICIENT_DATA";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type InsightPriority = "LOW" | "MEDIUM" | "HIGH";

export type InsightType =
  | "SPENDING_INCREASE"
  | "SPENDING_DECREASE"
  | "BUDGET_WARNING"
  | "BUDGET_OVERFLOW"
  | "PROJECTED_BUDGET_OVERFLOW"
  | "SAVINGS_OPPORTUNITY"
  | "SAVINGS_TARGET_RISK"
  | "DEBT_PAYMENT_RISK"
  | "DEBT_PAYOFF_SCENARIO"
  | "EMERGENCY_FUND_GAP"
  | "INCOME_CHANGE"
  | "CASHFLOW_RISK"
  | "BUDGET_CONFLICT"
  | "UNUSUAL_CATEGORY_SPENDING";

export type RecommendationStatus =
  | "NEW"
  | "VIEWED"
  | "ACCEPTED"
  | "DISMISSED"
  | "EXPIRED";

export interface Period {
  year: number;
  month: number;
}

export interface CategoryMonthlySpend {
  categoryId: string;
  categoryName: string;
  amounts: number[]; // oldest → newest completed months
  currentAmount: number;
  currency: Currency;
  classification: ExpenseClass;
  nature: ExpenseNature;
}

export interface EvidenceItem {
  metric: string;
  current?: number;
  average3m?: number;
  changePercent?: number;
  [key: string]: unknown;
}

export interface InsightRecommendation {
  type: InsightType;
  priority: InsightPriority;
  title: string;
  message: string;
  categoryId?: string;
  debtId?: string;
  goalId?: string;
  currentValue?: number;
  recommendedValue?: number;
  difference?: number;
  evidence: EvidenceItem[];
  actionType?: string;
  period: Period;
}

export interface BudgetCategoryRecommendation {
  categoryId: string;
  categoryName: string;
  recommendedAmount: number;
  historicalAverage: number;
  currentAmount: number;
  percentageChange: number;
  classification: ExpenseClass;
  nature: ExpenseNature;
  rationale: string[];
}

export type IncomeSource = "SALARY" | "HISTORY";

export interface BudgetRecommendationResult {
  month: number;
  year: number;
  currency: Currency;
  categories: BudgetCategoryRecommendation[];
  totalIncome: number;
  totalExpenses: number;
  totalDebtPayment: number;
  /** Fixed costs from planning model (when configured). */
  totalFixedCosts: number;
  totalSavings: number;
  buffer: number;
  incomeSource: IncomeSource;
  rationale: string[];
  confidence: Confidence;
  conflict?: {
    code: "BUDGET_CONFLICT";
    message: string;
    mandatory: number;
    targetSavings: number;
    expectedIncome: number;
  };
}

export interface CashFlowForecast {
  projectedIncome: number;
  projectedExpenses: number;
  /** Variable + fixed (when Fixed costs model is used, fixed is included here). */
  projectedFixedCosts: number;
  projectedDebtPayment: number;
  projectedSavings: number;
  startingBalance: number;
  projectedEndingBalance: number;
  assumptions: string[];
  confidence: Confidence;
  currency: Currency;
  incomeSource: IncomeSource;
}

export interface DebtScenario {
  label: string;
  monthlyPayment: number;
  estimatedMonths: number | null;
  totalPayment: number | null;
  estimatedInterest: number | null;
  note?: string;
}

export interface WhatIfInput {
  incomeOverride?: number;
  expenseOverrides?: Array<{ categoryId: string; amount: number }>;
  debtPaymentOverride?: number;
  savingsOverride?: number;
}

export interface WhatIfResult {
  cashFlow: number;
  savings: number;
  debtPayoffMonths: number | null;
  endingBalance: number;
  assumptions: string[];
}
