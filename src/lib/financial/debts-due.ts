import { Account } from "@/models/Account";
import { Debt } from "@/models/Debt";
import { DebtPayment } from "@/models/DebtPayment";
import { resolvePeriodBounds, type Period } from "@/lib/financial/summary";
import type { Currency } from "@/types";

export type DebtObligationType =
  | "INSTALLMENT"
  | "CREDIT_STATEMENT"
  | "PAYOFF"
  | "TRANSFER"
  | "OTHER";

export type DebtDueItem = {
  debtId: string;
  name: string;
  currency: Currency;
  /** Amount due this cycle (cicilan or full if lump-sum). */
  dueAmount: number;
  paidAmount: number;
  remainingDue: number;
  /** Full outstanding principal. */
  remainingAmount: number;
  dueDate?: string;
  monthlyPayment: number | null;
  installmentMonths: number | null;
  isInstallment: boolean;
  obligationType: DebtObligationType;
  linkedAccountId?: string;
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

export function deriveMonthlyInstallment(debt: {
  remainingAmount: number;
  plannedPayment?: number | null;
  minimumPayment?: number | null;
  installmentMonths?: number | null;
}): { monthlyPayment: number | null; installmentMonths: number | null } {
  if (debt.remainingAmount <= 0) {
    return { monthlyPayment: null, installmentMonths: null };
  }

  const months =
    debt.installmentMonths != null && debt.installmentMonths > 0
      ? debt.installmentMonths
      : null;

  const explicit = debt.plannedPayment ?? debt.minimumPayment ?? null;
  if (explicit != null && explicit > 0) {
    return {
      monthlyPayment: explicit,
      installmentMonths:
        months ?? Math.max(1, Math.ceil(debt.remainingAmount / explicit)),
    };
  }

  if (months != null) {
    return {
      monthlyPayment: Math.ceil(debt.remainingAmount / months),
      installmentMonths: months,
    };
  }

  return { monthlyPayment: null, installmentMonths: null };
}

/**
 * Monthly obligation for a debt this period:
 * 1) cicilan from plannedPayment / minimumPayment / installmentMonths
 * 2) else full remaining if dueDate falls in this window or is overdue
 */
export function monthlyDebtObligation(
  debt: {
    remainingAmount: number;
    plannedPayment?: number | null;
    minimumPayment?: number | null;
    installmentMonths?: number | null;
    dueDate?: Date | null;
  },
  start: Date,
  end: Date
): {
  dueAmount: number;
  monthlyPayment: number | null;
  installmentMonths: number | null;
  isInstallment: boolean;
} {
  if (debt.remainingAmount <= 0) {
    return {
      dueAmount: 0,
      monthlyPayment: null,
      installmentMonths: null,
      isInstallment: false,
    };
  }

  const derived = deriveMonthlyInstallment(debt);
  if (derived.monthlyPayment != null && derived.monthlyPayment > 0) {
    return {
      dueAmount: Math.min(derived.monthlyPayment, debt.remainingAmount),
      monthlyPayment: derived.monthlyPayment,
      installmentMonths: derived.installmentMonths,
      isInstallment: true,
    };
  }

  if (
    isDueInPeriod(debt.dueDate, start, end) ||
    isOverdueBeforePeriodEnd(debt.dueDate, end)
  ) {
    return {
      dueAmount: debt.remainingAmount,
      monthlyPayment: null,
      installmentMonths: null,
      isInstallment: false,
    };
  }

  return {
    dueAmount: 0,
    monthlyPayment: null,
    installmentMonths: null,
    isInstallment: false,
  };
}

export async function getDebtsDueInRange(
  userId: string,
  start: Date,
  end: Date,
  preferredCurrency: Currency = "IDR"
): Promise<Omit<DebtsDueThisMonth, "period">> {
  const [debts, payments, ccAccounts] = await Promise.all([
    Debt.find({ userId, status: "ACTIVE" }).lean(),
    DebtPayment.find({
      userId,
      date: { $gte: start, $lte: end },
    }).lean(),
    Account.find({ userId, isActive: true, type: "CREDIT_CARD" }).lean(),
  ]);

  const ccById = new Map(
    ccAccounts.map((a) => [a._id.toString(), a] as const)
  );

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
    const obligationType = (debt.obligationType ??
      "INSTALLMENT") as DebtObligationType;
    const linkedAccountId = debt.linkedAccountId?.toString();

    let dueAmount = 0;
    let monthlyPayment: number | null = null;
    let installmentMonths: number | null = null;
    let isInstallment = false;

    if (obligationType === "CREDIT_STATEMENT" && linkedAccountId) {
      const card = ccById.get(linkedAccountId);
      const statementDue = Math.max(
        0,
        card?.statementDueAmount ??
          debt.plannedPayment ??
          debt.minimumPayment ??
          0
      );
      dueAmount = Math.min(statementDue, debt.remainingAmount);
      monthlyPayment = dueAmount > 0 ? dueAmount : null;
      isInstallment = true;
    } else {
      const derived = monthlyDebtObligation(debt, start, end);
      dueAmount = derived.dueAmount;
      monthlyPayment = derived.monthlyPayment;
      installmentMonths = derived.installmentMonths;
      isInstallment = derived.isInstallment;
    }

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
      remainingAmount: debt.remainingAmount,
      dueDate: debt.dueDate ? new Date(debt.dueDate).toISOString() : undefined,
      monthlyPayment,
      installmentMonths,
      isInstallment,
      obligationType,
      linkedAccountId,
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
  const { start, end } = await resolvePeriodBounds(userId, period);
  const due = await getDebtsDueInRange(userId, start, end, preferredCurrency);
  return { period, ...due };
}
