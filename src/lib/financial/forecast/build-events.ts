import { addDays, addMonths, startOfDay } from "date-fns";
import {
  allOccurrencesInRange,
  type FixedCostDueItem,
} from "@/lib/financial/fixed-costs";
import { resolvePaydayInMonth } from "@/lib/financial/payday";
import { toDateKey } from "@/lib/financial/forecast/cash-flow-forecast-math";
import type {
  ForecastEvent,
  ForecastIncomeClass,
} from "@/lib/financial/forecast/types";
import type { Currency } from "@/types";

/** Build salary income events on weekend-adjusted paydays in [asOf, horizonEnd]. */
export function buildSalaryEvents(input: {
  paydayDay: number;
  monthlySalary: number;
  currency: Currency;
  asOf: Date;
  horizonEnd: Date;
}): { events: ForecastEvent[]; incomeClass: ForecastIncomeClass } {
  if (!(input.monthlySalary > 0)) {
    return { events: [], incomeClass: "NONE" };
  }

  const events: ForecastEvent[] = [];
  const start = startOfDay(input.asOf);
  const end = startOfDay(input.horizonEnd);

  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= last) {
    const payday = resolvePaydayInMonth(
      input.paydayDay,
      cursor.getFullYear(),
      cursor.getMonth()
    );
    if (payday >= start && payday <= end) {
      const date = toDateKey(payday);
      events.push({
        id: `salary:${date}`,
        date,
        kind: "INCOME",
        amount: input.monthlySalary,
        direction: "IN",
        label: "Monthly salary (settings)",
        source: "User.monthlySalary",
        incomeClass: "SCHEDULED_SALARY",
      });
    }
    cursor = addMonths(cursor, 1);
  }

  return {
    events,
    incomeClass: events.length > 0 ? "SCHEDULED_SALARY" : "NONE",
  };
}

export function buildFixedCostEvents(
  items: Array<
    Pick<FixedCostDueItem, "fixedCostId" | "name" | "amount" | "currency" | "dueDay">
  >,
  currency: Currency,
  asOf: Date,
  horizonEnd: Date
): ForecastEvent[] {
  const events: ForecastEvent[] = [];
  for (const item of items) {
    if (item.currency !== currency) continue;
    const dates = allOccurrencesInRange(item.dueDay, asOf, horizonEnd);
    for (const d of dates) {
      const date = toDateKey(d);
      events.push({
        id: `fixed:${item.fixedCostId}:${date}`,
        date,
        kind: "FIXED_COST",
        amount: item.amount,
        direction: "OUT",
        label: item.name,
        source: "FixedCost",
        linkedId: item.fixedCostId,
      });
    }
  }
  return events;
}

export type DebtForecastInput = {
  debtId: string;
  name: string;
  currency: Currency;
  remainingAmount: number;
  /** Remaining due this cycle after payments (preferred for near-term). */
  remainingDue?: number;
  monthlyPayment: number | null;
  dueDay: number | null;
  obligationType?: string | null;
};

/**
 * Schedule debt outflows on due-day occurrences.
 * Caps cumulative scheduled amount at remaining principal to avoid over-projecting.
 * Does not include debts already fully paid for the near obligation when remainingDue=0
 * for the first occurrence only when remainingDue is provided.
 */
export function buildDebtEvents(
  debts: DebtForecastInput[],
  currency: Currency,
  asOf: Date,
  horizonEnd: Date
): ForecastEvent[] {
  const events: ForecastEvent[] = [];

  for (const debt of debts) {
    if (debt.currency !== currency) continue;
    if (!(debt.remainingAmount > 0)) continue;

    const payment =
      debt.monthlyPayment != null && debt.monthlyPayment > 0
        ? debt.monthlyPayment
        : null;
    if (payment == null) continue;

    const dueDay = debt.dueDay ?? 1;
    const dates = allOccurrencesInRange(dueDay, asOf, horizonEnd);
    let remainingPrincipal = debt.remainingAmount;
    let first = true;

    for (const d of dates) {
      if (remainingPrincipal <= 0) break;
      let amount = Math.min(payment, remainingPrincipal);

      if (first && debt.remainingDue != null) {
        if (debt.remainingDue <= 0) {
          first = false;
          // Already paid this cycle's installment — skip first due, continue later months
          continue;
        }
        amount = Math.min(debt.remainingDue, remainingPrincipal);
      }
      first = false;

      const date = toDateKey(d);
      events.push({
        id: `debt:${debt.debtId}:${date}`,
        date,
        kind: "DEBT",
        amount,
        direction: "OUT",
        label: debt.name,
        source: "Debt",
        linkedId: debt.debtId,
      });
      remainingPrincipal -= amount;
    }
  }

  return events;
}

/**
 * Average daily variable spend from expense samples that are not debt/fixed-cost linked.
 * Used as an explicit USER/HISTORY assumption — not a probabilistic claim.
 */
export function averageDailyVariableSpend(
  expenses: Array<{ amount: number; debtId?: unknown; fixedCostId?: unknown }>,
  sampleDays: number
): number {
  if (sampleDays <= 0) return 0;
  const variable = expenses
    .filter((e) => !e.debtId && !e.fixedCostId)
    .reduce((sum, e) => sum + e.amount, 0);
  return Math.round(variable / sampleDays);
}

export function horizonEndDate(asOf: Date, horizonDays: number): Date {
  return startOfDay(addDays(startOfDay(asOf), horizonDays - 1));
}
