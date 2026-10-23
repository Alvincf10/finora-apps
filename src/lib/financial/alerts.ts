import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  startOfDay,
} from "date-fns";
import { Debt } from "@/models/Debt";
import { FixedCost } from "@/models/FixedCost";
import { getBudgetOverview } from "@/lib/financial/summary";
import { getUserPaydayDay, periodFromDate } from "@/lib/financial/pay-cycle";
import { formatMoney } from "@/lib/money";
import { daysInMonth } from "@/lib/financial/phase2-math";
import type { Currency } from "@/types";

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";

export type AlertKind =
  | "DEBT_OVERDUE"
  | "DEBT_DUE_SOON"
  | "FIXED_COST_DUE"
  | "BUDGET_OVERFLOW"
  | "BUDGET_WARNING";

export type AppAlert = {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  message: string;
  href: string;
  dueDate?: string;
};

const DUE_SOON_DAYS = 3;

function dateOnDueDay(year: number, monthIndex: number, dueDay: number): Date {
  const dim = daysInMonth(year, monthIndex + 1);
  return startOfDay(new Date(year, monthIndex, Math.min(dueDay, dim)));
}

function thisMonthFixedDue(dueDay: number, now: Date): Date {
  return dateOnDueDay(now.getFullYear(), now.getMonth(), dueDay);
}

/**
 * Deterministic in-app alerts — no persistence, computed from live data.
 */
export async function getAlertsForUser(userId: string): Promise<AppAlert[]> {
  const now = new Date();
  const today = startOfDay(now);
  const soon = endOfDay(addDays(today, DUE_SOON_DAYS));
  const paydayDay = await getUserPaydayDay(userId);
  const period = periodFromDate(paydayDay, now);

  const [debts, fixedCosts, budgets] = await Promise.all([
    Debt.find({ userId, status: "ACTIVE" }).lean(),
    FixedCost.find({ userId, isActive: true }).lean(),
    getBudgetOverview(userId, period),
  ]);

  const alerts: AppAlert[] = [];

  for (const debt of debts) {
    if (!debt.dueDate || debt.remainingAmount <= 0) continue;
    const due = startOfDay(new Date(debt.dueDate));
    const currency = debt.currency as Currency;
    const amountLabel = formatMoney(
      debt.plannedPayment ?? debt.minimumPayment ?? debt.remainingAmount,
      currency
    );

    if (due < today) {
      const days = differenceInCalendarDays(today, due);
      alerts.push({
        id: `debt-overdue:${debt._id}`,
        kind: "DEBT_OVERDUE",
        severity: "CRITICAL",
        title: `${debt.name} overdue`,
        message: `Jatuh tempo ${days} hari lalu · ${amountLabel}`,
        href: "/debts",
        dueDate: due.toISOString(),
      });
    } else if (due <= soon) {
      const days = differenceInCalendarDays(due, today);
      alerts.push({
        id: `debt-due:${debt._id}:${due.toISOString().slice(0, 10)}`,
        kind: "DEBT_DUE_SOON",
        severity: days === 0 ? "CRITICAL" : "WARNING",
        title:
          days === 0
            ? `${debt.name} due today`
            : `${debt.name} due in ${days}d`,
        message: `Bayar ${amountLabel} sebelum lewat tempo`,
        href: "/debts",
        dueDate: due.toISOString(),
      });
    }
  }

  for (const cost of fixedCosts) {
    const due = thisMonthFixedDue(cost.dueDay, now);
    if (due < today || due > soon) continue;
    const days = differenceInCalendarDays(due, today);
    const currency = cost.currency as Currency;
    alerts.push({
      id: `fixed:${cost._id}:${due.toISOString().slice(0, 10)}`,
      kind: "FIXED_COST_DUE",
      severity: days === 0 ? "WARNING" : "INFO",
      title:
        days === 0
          ? `${cost.name} due today`
          : `${cost.name} due in ${days}d`,
      message: `Fixed cost ${formatMoney(cost.amount, currency)} (tgl ${cost.dueDay})`,
      href: "/fixed-costs",
      dueDate: due.toISOString(),
    });
  }

  for (const b of budgets) {
    if (b.overBudget) {
      alerts.push({
        id: `budget-over:${b.categoryId}:${period.year}-${period.month}`,
        kind: "BUDGET_OVERFLOW",
        severity: "CRITICAL",
        title: `${b.categoryName} over budget`,
        message: `${formatMoney(b.actualAmount, b.currency)} / ${formatMoney(b.budgetAmount, b.currency)} (${b.utilizationPercentage}%)`,
        href: "/budget",
      });
    } else if (b.utilizationPercentage >= 80) {
      alerts.push({
        id: `budget-warn:${b.categoryId}:${period.year}-${period.month}`,
        kind: "BUDGET_WARNING",
        severity: "WARNING",
        title: `${b.categoryName} at ${b.utilizationPercentage}%`,
        message: `${formatMoney(b.actualAmount, b.currency)} of ${formatMoney(b.budgetAmount, b.currency)} used`,
        href: "/budget",
      });
    }
  }

  const rank: Record<AlertSeverity, number> = {
    CRITICAL: 0,
    WARNING: 1,
    INFO: 2,
  };
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return alerts;
}
