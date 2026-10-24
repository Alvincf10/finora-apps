import { User } from "@/models/User";
import { getDebtsDueInRange } from "@/lib/financial/debts-due";
import { getFixedCostsInRange } from "@/lib/financial/fixed-costs";
import {
  getPayCycleForPeriod,
  getUserPaydayDay,
} from "@/lib/financial/pay-cycle";
import type { IncomeSource, Period } from "@/lib/financial/phase2-types";
import type { Currency } from "@/types";

export type { IncomeSource };

export type PlanningBaselines = {
  currency: Currency;
  /** Settings take-home; 0 if not configured. */
  monthlySalary: number;
  incomeSource: IncomeSource;
  fixedCostsTotal: number;
  debtDueTotal: number;
  periodStart: string;
  periodEnd: string;
  cycleLabel: string;
};

/**
 * Shared payday-aware baselines for planning (Payday, insights context).
 * Period window = pay cycle for that month's payday (not calendar month).
 * Income prefers Settings.monthlySalary when set.
 */
export async function getPlanningBaselines(
  userId: string,
  period: Period
): Promise<PlanningBaselines> {
  const user = await User.findById(userId).lean();
  const currency = (user?.baseCurrency as Currency) ?? "IDR";
  const monthlySalary = Math.max(0, user?.monthlySalary ?? 0);
  const paydayDay = await getUserPaydayDay(userId);
  const cycle = getPayCycleForPeriod(paydayDay, period);
  const start = cycle.start;
  const end = cycle.end;

  const [fixed, debts] = await Promise.all([
    getFixedCostsInRange(userId, start, end, currency),
    getDebtsDueInRange(userId, start, end, currency),
  ]);

  return {
    currency,
    monthlySalary,
    incomeSource: monthlySalary > 0 ? "SALARY" : "HISTORY",
    fixedCostsTotal: fixed.total,
    debtDueTotal: debts.totalDue,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    cycleLabel: cycle.label,
  };
}

/** Resolve projected/expected income: Settings salary wins when set. */
export function resolveExpectedIncome(
  baselines: PlanningBaselines,
  historyIncome: number,
  monthToDateIncome = 0
): number {
  if (baselines.monthlySalary > 0) {
    return Math.max(
      baselines.monthlySalary,
      historyIncome,
      monthToDateIncome
    );
  }
  return Math.max(historyIncome, monthToDateIncome);
}
