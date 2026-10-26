import { calculateDebtScenario } from "@/lib/financial/phase2-math";
import { calculateEmergencyCoverageMonths } from "@/lib/financial/shared/emergency-coverage";
import {
  DECISION_LAB_RULES_VERSION,
  type ScenarioAssumptions,
  type ScenarioBaselineSnapshot,
  type ScenarioEvaluation,
} from "@/lib/financial/decision/types";

function pick(
  override: number | null | undefined,
  baseline: number
): number {
  return override != null ? override : baseline;
}

/**
 * Evaluate a scenario against an immutable baseline snapshot.
 * Pure / deterministic — never writes ledger data (FR-04.5).
 */
export function evaluateDecisionScenario(
  baseline: ScenarioBaselineSnapshot,
  assumptions: ScenarioAssumptions = {}
): ScenarioEvaluation {
  const changedInputs: string[] = [];
  if (assumptions.incomeOverride != null) changedInputs.push("income");
  if (assumptions.expensesOverride != null) changedInputs.push("expenses");
  if (assumptions.debtPaymentOverride != null) changedInputs.push("debtPayment");
  if (assumptions.savingsOverride != null) changedInputs.push("savings");
  if (assumptions.cashBufferOverride != null) changedInputs.push("cashBuffer");

  const income = pick(assumptions.incomeOverride, baseline.income);
  const expenses = pick(assumptions.expensesOverride, baseline.expenses);
  const debtPayment = pick(
    assumptions.debtPaymentOverride,
    baseline.debtPayment
  );
  const cashBuffer = Math.max(0, assumptions.cashBufferOverride ?? 0);

  const cashFlow = income - expenses - debtPayment;
  const savings =
    assumptions.savingsOverride != null
      ? assumptions.savingsOverride
      : cashFlow;

  const payoff = calculateDebtScenario(
    baseline.debtBalance,
    debtPayment,
    baseline.debtInterestRate
  );

  const remainingDebtAfterHorizon =
    payoff.estimatedMonths == null
      ? baseline.debtBalance
      : Math.max(0, baseline.debtBalance - debtPayment * Math.min(12, payoff.estimatedMonths));

  const endingBalance = baseline.startingBalance + cashFlow - cashBuffer;
  const cashShortfall = endingBalance < 0;

  const emergencyReserve = baseline.emergencyFund;
  const emergencyCoverageMonths = calculateEmergencyCoverageMonths(
    emergencyReserve + Math.max(0, savings),
    baseline.essentialMonthly ?? 0
  );

  const baselineEvalCashFlow =
    baseline.income - baseline.expenses - baseline.debtPayment;
  const baselineEnding =
    baseline.startingBalance + baselineEvalCashFlow;
  const baselinePayoff = calculateDebtScenario(
    baseline.debtBalance,
    baseline.debtPayment,
    baseline.debtInterestRate
  );
  const baselineCoverage = calculateEmergencyCoverageMonths(
    baseline.emergencyFund + Math.max(0, baseline.savings),
    baseline.essentialMonthly ?? 0
  );

  const unavailable: string[] = [];
  if (baseline.essentialMonthly == null || baseline.essentialMonthly <= 0) {
    unavailable.push("emergencyCoverageMonths (essentials missing)");
  }
  if (!(baseline.debtPayment > 0) && assumptions.debtPaymentOverride == null) {
    unavailable.push("debtPayoffMonths (no debt payment)");
  }

  const positives: string[] = [];
  const tradeOffs: string[] = [];
  if (cashFlow > baselineEvalCashFlow) {
    positives.push("Net cash flow higher than baseline");
  } else if (cashFlow < baselineEvalCashFlow) {
    tradeOffs.push("Net cash flow lower than baseline");
  }
  if (
    payoff.estimatedMonths != null &&
    baselinePayoff.estimatedMonths != null &&
    payoff.estimatedMonths < baselinePayoff.estimatedMonths
  ) {
    positives.push("Faster debt payoff than baseline");
  } else if (
    debtPayment > baseline.debtPayment &&
    cashFlow < baselineEvalCashFlow
  ) {
    tradeOffs.push("Higher debt payment reduces free cash flow");
  }
  if (cashShortfall) {
    tradeOffs.push("Projected ending balance is negative");
  }

  const assumptionNotes = [
    "Simulation only — does not mutate ledger, goals, or payday allocation.",
    `Evaluated against snapshot captured ${baseline.capturedAt}.`,
    `Rules ${DECISION_LAB_RULES_VERSION}; snapshot rules ${baseline.rulesVersion}.`,
  ];
  if (assumptions.savingsOverride != null) {
    assumptionNotes.push(
      "Savings override is display/target only; cash flow still uses income − expenses − debt."
    );
  }
  if (cashBuffer > 0) {
    assumptionNotes.push(
      `Cash buffer ${cashBuffer} held out of ending balance.`
    );
  }

  return {
    income,
    expenses,
    debtPayment,
    cashFlow,
    savings,
    debtPayoffMonths: payoff.estimatedMonths,
    remainingDebtAfterHorizon,
    startingBalance: baseline.startingBalance,
    endingBalance,
    emergencyCoverageMonths,
    cashShortfall,
    deltas: {
      cashFlow: cashFlow - baselineEvalCashFlow,
      savings: savings - baseline.savings,
      endingBalance: endingBalance - baselineEnding,
      debtPayoffMonths:
        payoff.estimatedMonths != null &&
        baselinePayoff.estimatedMonths != null
          ? payoff.estimatedMonths - baselinePayoff.estimatedMonths
          : null,
      emergencyCoverageMonths:
        emergencyCoverageMonths != null && baselineCoverage != null
          ? Math.round((emergencyCoverageMonths - baselineCoverage) * 100) /
            100
          : null,
    },
    changedInputs,
    assumptions: assumptionNotes,
    unavailable,
    tradeOffs,
    positives,
  };
}

/** Side-by-side comparison helper. */
export function compareScenarioEvaluations(
  rows: Array<{ id: string; name: string; isBaseline: boolean; evaluation: ScenarioEvaluation }>
) {
  return {
    rulesVersion: DECISION_LAB_RULES_VERSION,
    rows,
    bestCashFlowId: pickBest(rows, (e) => e.cashFlow),
    bestEndingBalanceId: pickBest(rows, (e) => e.endingBalance),
    fastestDebtPayoffId: pickBest(
      rows.filter((r) => r.evaluation.debtPayoffMonths != null),
      (e) => -(e.debtPayoffMonths ?? Number.POSITIVE_INFINITY)
    ),
  };
}

function pickBest(
  rows: Array<{ id: string; evaluation: ScenarioEvaluation }>,
  score: (e: ScenarioEvaluation) => number
): string | null {
  if (rows.length === 0) return null;
  let best = rows[0];
  for (const row of rows.slice(1)) {
    if (score(row.evaluation) > score(best.evaluation)) best = row;
  }
  return best.id;
}

/** Preview debt tenor without writing Debt documents. */
export function previewDebtTenor(input: {
  remainingAmount: number;
  months: number;
  annualInterestRate?: number | null;
}) {
  const months = Math.min(600, Math.max(1, Math.floor(input.months) || 1));
  const monthlyPayment = Math.ceil(input.remainingAmount / months);
  const scenario = calculateDebtScenario(
    input.remainingAmount,
    monthlyPayment,
    input.annualInterestRate ?? null
  );
  return {
    months,
    monthlyPayment,
    estimatedMonths: scenario.estimatedMonths,
    totalPayment: scenario.totalPayment,
    estimatedInterest: scenario.estimatedInterest,
    mutatesLedger: false as const,
  };
}
