import { addMonths, endOfMonth, max as maxDate } from "date-fns";

/**
 * Debt due window matches pay-cycle: through cycle end, extended to calendar
 * month-end so dues right after payday (e.g. Nov 25 after cycle ending Nov 24)
 * still count as this period's bills.
 */
export function resolveDebtDueWindowEnd(cycleEnd: Date): Date {
  return maxDate([cycleEnd, endOfMonth(cycleEnd)]);
}

/** Minimal fields for dashboard this-period vs upcoming split. */
export type DebtDashboardSplitItem = {
  remainingDue: number;
  paidAmount: number;
  remainingAmount?: number;
  dueDate?: string;
  dueAmount: number;
  monthlyPayment?: number | null;
  isInstallment?: boolean;
};

export function isDueInDebtWindow(
  dueDate: string | undefined,
  debtWindowEnd: Date | null
): boolean {
  if (!dueDate || !debtWindowEnd) return false;
  return new Date(dueDate) <= debtWindowEnd;
}

/**
 * Dashboard installment list (single card):
 * - unpaid dues inside the funding window (remainingDue > 0)
 * - settled this window (paid) with dueDate in window
 *
 * Far-future installments (after window end, e.g. Januari when window
 * ends 24 Des) stay in `upcoming` only — not the main period card.
 */
export function splitInstallmentDebtLists<T extends DebtDashboardSplitItem>(
  items: T[],
  debtWindowEnd: Date | null
): { thisPeriod: T[]; upcoming: T[] } {
  const isOpenInstallment = (d: T) =>
    (d.remainingAmount ?? 0) > 0 &&
    Boolean(d.isInstallment || d.monthlyPayment);

  const thisPeriod = items.filter(
    (d) =>
      d.remainingDue > 0 ||
      (d.remainingDue <= 0 &&
        d.paidAmount > 0 &&
        isDueInDebtWindow(d.dueDate, debtWindowEnd))
  );

  const upcoming = items.filter(
    (d) => d.remainingDue <= 0 && isOpenInstallment(d)
  );

  return { thisPeriod, upcoming };
}

/** Next installment due date for the upcoming card (bump +1 month if still in window). */
export function nextInstallmentDueDate(
  dueDate: string | undefined,
  debtWindowEnd: Date | null
): Date | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (isDueInDebtWindow(dueDate, debtWindowEnd)) {
    return addMonths(d, 1);
  }
  return d;
}

export function nextInstallmentAmount(d: {
  dueAmount: number;
  monthlyPayment?: number | null;
  remainingAmount?: number;
}): number {
  const raw = d.dueAmount > 0 ? d.dueAmount : (d.monthlyPayment ?? 0);
  return Math.min(raw, Math.max(0, d.remainingAmount ?? 0));
}
