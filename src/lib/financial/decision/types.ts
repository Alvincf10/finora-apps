import type { Currency } from "@/types";
import type { Period } from "@/lib/financial/phase2-types";

export const DECISION_LAB_RULES_VERSION = "phase4-fr04-1";

export type ScenarioBaselineSnapshot = {
  capturedAt: string;
  period: Period;
  cycleLabel?: string;
  currency: Currency;
  income: number;
  expenses: number;
  debtPayment: number;
  savings: number;
  debtBalance: number;
  debtInterestRate: number | null;
  startingBalance: number;
  liquidAssets: number;
  netWorth: number;
  essentialMonthly: number | null;
  emergencyFund: number;
  rulesVersion: string;
};

export type ScenarioAssumptions = {
  incomeOverride?: number | null;
  expensesOverride?: number | null;
  debtPaymentOverride?: number | null;
  savingsOverride?: number | null;
  /** Optional extra cash buffer held out of ending balance. */
  cashBufferOverride?: number | null;
};

export type ScenarioEvaluation = {
  income: number;
  expenses: number;
  debtPayment: number;
  cashFlow: number;
  savings: number;
  debtPayoffMonths: number | null;
  remainingDebtAfterHorizon: number | null;
  startingBalance: number;
  endingBalance: number;
  emergencyCoverageMonths: number | null;
  cashShortfall: boolean;
  deltas: {
    cashFlow: number;
    savings: number;
    endingBalance: number;
    debtPayoffMonths: number | null;
    emergencyCoverageMonths: number | null;
  };
  changedInputs: string[];
  assumptions: string[];
  unavailable: string[];
  tradeOffs: string[];
  positives: string[];
};

export type ScenarioComparisonRow = {
  id: string;
  name: string;
  isBaseline: boolean;
  evaluation: ScenarioEvaluation;
};
