import type { DebtKind } from "@/types";

export const LADDER_CASH_TARGET_IDR = 10_000_000;
export const LADDER_STARTER_GOAL_NAME = "Tabungan dasar 10jt";
export const LADDER_EMERGENCY_MONTHS = 3;
export const LADDER_EMERGENCY_STRETCH_MONTHS = 6;
export const LADDER_INVEST_RATIO = 0.2;
export const LADDER_RULE_VERSION = "phase3-p0p1-1";

export type LadderStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ConditionMet = boolean | "UNKNOWN";

export type LadderStepStatus =
  | "COMPLETED"
  | "FOCUS"
  | "LOCKED"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

/** @deprecated UI aliases — prefer LadderStepStatus */
export type LegacyLadderStatus = "DONE" | "CURRENT" | "UPCOMING";

export type LadderActionType =
  | "VIEW_ACCOUNTS"
  | "VIEW_DEBT"
  | "VIEW_GOALS"
  | "VIEW_BUDGET_REC"
  | "VIEW_SPENDING"
  | "NONE";

export type LadderProgressUnit = "IDR" | "MONTHS" | "PERCENT" | "BOOLEAN";

export interface LadderConditionInput {
  step: LadderStepId;
  conditionMet: ConditionMet;
  /** Explicit user preference — only for steps that allow it (e.g. education). */
  notApplicable?: boolean;
}

export interface LadderGateResult {
  step: LadderStepId;
  conditionMet: ConditionMet;
  gateUnlocked: boolean;
  creditedComplete: boolean;
  status: LadderStepStatus;
  notApplicable: boolean;
}

export function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function nameMatches(name: string, patterns: RegExp[]) {
  const n = name.toLowerCase();
  return patterns.some((p) => p.test(n));
}

export function inferDebtKind(
  name: string,
  kind?: DebtKind | null
): DebtKind {
  if (kind === "MORTGAGE" || kind === "CONSUMER" || kind === "OTHER") {
    return kind;
  }
  if (
    nameMatches(name, [
      /\bkpr\b/,
      /mortgage/,
      /rumah/,
      /properti/,
      /home\s*loan/,
      /kredit\s*pemilikan/,
    ])
  ) {
    return "MORTGAGE";
  }
  return "CONSUMER";
}

export const STARTER_CASH_PATTERNS = [
  /tabungan\s*dasar/,
  /nabung\s*cash/,
  /cash\s*10/,
  /10\s*juta/,
  /10jt/,
  /starter\s*cash/,
  /basic\s*saving/,
];
export const EMERGENCY_PATTERNS = [
  /emergency/,
  /darurat/,
  /efund/,
  /e-fund/,
  /dana\s*darurat/,
  /emergency\s*fund/,
];

/** Prefer profile essentials; else infer from emergency goal target ÷ N months. */
export function resolveEssentialMonthly(input: {
  essentialFromCategories: number;
  averageFixedExpense: number;
  averageMonthlyExpense: number;
  emergencyGoalTarget?: number | null;
  emergencyMonths?: number;
}): {
  essentialMonthly: number;
  source: "categories" | "fixed" | "expense" | "goal_target" | "none";
} {
  const months = input.emergencyMonths ?? LADDER_EMERGENCY_MONTHS;
  if (input.essentialFromCategories > 0) {
    return {
      essentialMonthly: Math.round(input.essentialFromCategories),
      source: "categories",
    };
  }
  if (input.averageFixedExpense > 0) {
    return {
      essentialMonthly: Math.round(input.averageFixedExpense),
      source: "fixed",
    };
  }
  if (input.averageMonthlyExpense > 0) {
    return {
      essentialMonthly: Math.round(input.averageMonthlyExpense),
      source: "expense",
    };
  }
  if (input.emergencyGoalTarget && input.emergencyGoalTarget > 0 && months > 0) {
    return {
      essentialMonthly: Math.round(input.emergencyGoalTarget / months),
      source: "goal_target",
    };
  }
  return { essentialMonthly: 0, source: "none" };
}
export const EDUCATION_PATTERNS = [
  /pendidikan/,
  /education/,
  /sekolah/,
  /kuliah/,
  /\banak\b/,
  /campus/,
  /tuition/,
];
export const INVEST_PATTERNS = [
  /invest/,
  /investasi/,
  /reksa/,
  /saham/,
  /obligasi/,
  /crypto/,
  /kripto/,
  /etf/,
  /deposito/,
];
export const GIVING_PATTERNS = [
  /berbagi/,
  /sedekah/,
  /zakat/,
  /infaq/,
  /wakaf/,
  /amal/,
  /donasi/,
  /charity/,
  /tithe/,
  /kekayaan/,
];
export const WEALTH_PATTERNS = [/kekayaan/, /wealth/, /legacy/, /abadi/];

export function isStarterCashGoal(name: string, targetAmount: number) {
  if (nameMatches(name, STARTER_CASH_PATTERNS)) return true;
  return (
    targetAmount === LADDER_CASH_TARGET_IDR &&
    nameMatches(name, [/tabungan/])
  );
}

/** Eligible liquid = active non-liability cash/bank/ewallet, IDR only, floors at 0. */
export function calculateEligibleLiquidBalanceIdr(
  accounts: Array<{
    currency: string;
    type: string;
    isActive?: boolean;
    currentBalance?: number;
  }>
) {
  const LIQUID = new Set(["CASH", "BANK", "E_WALLET"]);
  return accounts
    .filter(
      (a) =>
        a.isActive !== false &&
        a.currency === "IDR" &&
        LIQUID.has(a.type) &&
        a.type !== "CREDIT_CARD"
    )
    .reduce((sum, a) => sum + Math.max(0, a.currentBalance ?? 0), 0);
}

/**
 * Starter cash goal progress is contribution-only (capped at target).
 * Account liquid balances are NOT auto-counted — otherwise BCA/ATM cash
 * looks like "sudah nabung" when the user hasn't contributed to the goal.
 */
export function syncStarterGoalAmount(
  manualContribution: number,
  _eligibleLiquidBalanceIdr?: number
) {
  return Math.min(
    LADDER_CASH_TARGET_IDR,
    Math.max(0, manualContribution)
  );
}

export function calculateEmergencyCoverage(
  emergencyFund: number,
  essentialMonthly: number
): { coverageMonths: number | null; conditionMet: ConditionMet } {
  if (!(essentialMonthly > 0)) {
    return { coverageMonths: null, conditionMet: "UNKNOWN" };
  }
  const coverageMonths = emergencyFund / essentialMonthly;
  return {
    coverageMonths,
    conditionMet: coverageMonths >= LADDER_EMERGENCY_MONTHS,
  };
}

export function calculateInvestmentRate(
  netEligibleInvestment: number,
  eligibleNetIncome: number
): { rate: number | null; conditionMet: ConditionMet } {
  if (!(eligibleNetIncome > 0)) {
    return { rate: null, conditionMet: "UNKNOWN" };
  }
  const rate = netEligibleInvestment / eligibleNetIncome;
  return {
    rate,
    conditionMet: rate >= LADDER_INVEST_RATIO,
  };
}

/**
 * Sequential gate (PRD §7).
 * - NOT_APPLICABLE skipped in gate + denominator
 * - UNKNOWN never credited; becomes FOCUS when unlocked
 * - Later steps stay LOCKED even if conditionMet
 */
export function applySequentialGate(
  inputs: LadderConditionInput[]
): LadderGateResult[] {
  const sorted = [...inputs].sort((a, b) => a.step - b.step);
  const results: LadderGateResult[] = [];
  let blocked = false;

  for (const input of sorted) {
    const notApplicable = Boolean(input.notApplicable);
    if (notApplicable) {
      results.push({
        step: input.step,
        conditionMet: input.conditionMet,
        gateUnlocked: !blocked,
        creditedComplete: false,
        status: "NOT_APPLICABLE",
        notApplicable: true,
      });
      continue;
    }

    const gateUnlocked = !blocked;
    const met = input.conditionMet === true;
    const unknown = input.conditionMet === "UNKNOWN";

    let status: LadderStepStatus;
    let creditedComplete = false;

    if (!gateUnlocked) {
      status = "LOCKED";
    } else if (met) {
      status = "COMPLETED";
      creditedComplete = true;
    } else if (unknown) {
      status = "UNKNOWN";
      blocked = true;
    } else {
      status = "FOCUS";
      blocked = true;
    }

    results.push({
      step: input.step,
      conditionMet: input.conditionMet,
      gateUnlocked,
      creditedComplete,
      status,
      notApplicable: false,
    });
  }

  return results;
}

export function calculateLadderProgress(gates: LadderGateResult[]) {
  const applicable = gates.filter((g) => !g.notApplicable);
  const applicableRequiredSteps = applicable.length;
  if (applicableRequiredSteps === 0) {
    return {
      progressPercent: 0,
      completedRequiredSteps: 0,
      applicableRequiredSteps: 0,
      activeStep: null as LadderStepId | null,
    };
  }

  // Count prefix of credited completes only (sequential)
  let completedRequiredSteps = 0;
  for (const g of applicable) {
    if (g.creditedComplete) completedRequiredSteps += 1;
    else break;
  }

  const focus = gates.find(
    (g) => g.status === "FOCUS" || g.status === "UNKNOWN"
  );
  const activeStep =
    focus?.step ??
    (completedRequiredSteps >= applicableRequiredSteps
      ? (applicable[applicable.length - 1]?.step ?? null)
      : null);

  return {
    progressPercent: Math.floor(
      (completedRequiredSteps / applicableRequiredSteps) * 100
    ),
    completedRequiredSteps,
    applicableRequiredSteps,
    activeStep,
  };
}

export function toLegacyStatus(status: LadderStepStatus): LegacyLadderStatus {
  if (status === "COMPLETED") return "DONE";
  if (status === "FOCUS" || status === "UNKNOWN") return "CURRENT";
  return "UPCOMING";
}
