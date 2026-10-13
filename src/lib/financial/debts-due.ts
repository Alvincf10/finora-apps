import { Debt } from "@/models/Debt";
import { DebtPayment } from "@/models/DebtPayment";
import { getPeriodBounds, type Period } from "@/lib/financial/summary";
import type { Currency } from "@/types";

export type DebtDueItem = {
  debtId: string;
  name: string;
  currency: Currency;
  dueAmount: number;
  paidAmount: number;
  remainingDue: number;
  dueDate?: string;
  monthlyPayment: number | null;
};

export type DebtsDueThisMonth = {
  period: Period;
  items: DebtDueItem[];
  totalDue: number;
  totalPaid: number;
  totalRemaining: number;
  currency: Currency;
  byCurrency: Array<{
    currency: Currency;
    totalDue: number;
    totalPaid: number;
    totalRemaining: number;
  }>;
};

function isDueInPeriod(dueDate: Date | undefined | null, start: Date, end: Date) {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  return d >= start && d <= end;
}

function isOverdueBeforePeriodEnd(dueDate: Date | undefined | null, end: Date) {
  if (!dueDate) return false;
  return new Date(dueDate) < end;
}

/**
 * Monthly obligation for a debt this period:
 * 1) plannedPayment / minimumPayment (capped by remaining)
 * 2) else full remaining if dueDate falls in this month or is overdue
 */
export function monthlyDebtObligation(
  debt: {
    remainingAmount: number;
    plannedPayment?: number | null;
    minimumPayment?: number | null;
    dueDate?: Date | null;
  },
  start: Date,
  end: Date
): { dueAmount: number; monthlyPayment: number | null } {
  const installment = debt.plannedPayment ?? debt.minimumPayment ?? null;
  if (installment != null && installment > 0) {
    return {
      dueAmount: Math.min(installment, debt.remainingAmount),
      monthlyPayment: installment,
    };
  }

  if (
    debt.remainingAmount > 0 &&
    (isDueInPeriod(debt.dueDate, start, end) ||
      isOverdueBeforePeriodEnd(debt.dueDate, end))
  ) {
    return { dueAmount: debt.remainingAmount, monthlyPayment: null };
  }

  return { dueAmount: 0, monthlyPayment: null };
}

export async function getDebtsDueInRange(
  userId: string,
  start: Date,
  end: Date,
  preferredCurrency: Currency = "IDR"
): Promise<Omit<DebtsDueThisMonth, "period">> {
  const [debts, payments] = await Promise.all([
    Debt.find({ userId, status: "ACTIVE" }).lean(),
    DebtPayment.find({
      userId,
      date: { $gte: start, $lte: end },
    }).lean(),
  ]);

  const paidByDebt = new Map<string, number>();
  for (const p of payments) {
    const key = p.debtId.toString();
    paidByDebt.set(key, (paidByDebt.get(key) ?? 0) + p.amount);
  }

  const items: DebtDueItem[] = [];
  const currencyTotals = new Map<
    Currency,
    { totalDue: number; totalPaid: number; totalRemaining: number }
  >();

  for (const debt of debts) {
    const { dueAmount, monthlyPayment } = monthlyDebtObligation(
      debt,
      start,
      end
    );
    if (dueAmount <= 0) continue;

    const debtId = debt._id.toString();
    const paidAmount = Math.min(paidByDebt.get(debtId) ?? 0, dueAmount);
    const remainingDue = Math.max(0, dueAmount - paidAmount);
    const currency = debt.currency as Currency;

    items.push({
      debtId,
      name: debt.name,
      currency,
      dueAmount,
      paidAmount,
      remainingDue,
      dueDate: debt.dueDate ? new Date(debt.dueDate).toISOString() : undefined,
      monthlyPayment,
    });

    const bucket = currencyTotals.get(currency) ?? {
      totalDue: 0,
      totalPaid: 0,
      totalRemaining: 0,
    };
    bucket.totalDue += dueAmount;
    bucket.totalPaid += paidAmount;
    bucket.totalRemaining += remainingDue;
    currencyTotals.set(currency, bucket);
  }

  items.sort((a, b) => b.remainingDue - a.remainingDue);

  const byCurrency = [...currencyTotals.entries()].map(([currency, totals]) => ({
    currency,
    ...totals,
  }));

  const primary =
    byCurrency.find((b) => b.currency === preferredCurrency) ?? byCurrency[0];

  return {
    items,
    totalDue: primary?.totalDue ?? 0,
    totalPaid: primary?.totalPaid ?? 0,
    totalRemaining: primary?.totalRemaining ?? 0,
    currency: primary?.currency ?? preferredCurrency,
    byCurrency,
  };
}

export async function getDebtsDueThisMonth(
  userId: string,
  period: Period,
  preferredCurrency: Currency = "IDR"
): Promise<DebtsDueThisMonth> {
  const { start, end } = getPeriodBounds(period);
  const due = await getDebtsDueInRange(userId, start, end, preferredCurrency);
  return { period, ...due };
}
