import { endOfMonth, startOfMonth } from "date-fns";
import { User } from "@/models/User";
import { getDebtsDueInRange } from "@/lib/financial/debts-due";
import { getFixedCostsInRange } from "@/lib/financial/fixed-costs";
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
};

/**
 * Shared payday-aware baselines for Forecast + Smart Budget.
 * Period window is the selected calendar month (matches month pickers).
 * Income prefers Settings.monthlySalary when set.
 */
export async function getPlanningBaselines(
  userId: string,
  period: Period
): Promise<PlanningBaselines> {
  const user = await User.findById(userId).lean();
  const currency = (user?.baseCurrency as Currency) ?? "IDR";
  const monthlySalary = Math.max(0, user?.monthlySalary ?? 0);
  const start = startOfMonth(new Date(period.year, period.month - 1, 1));
  const end = endOfMonth(start);

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
