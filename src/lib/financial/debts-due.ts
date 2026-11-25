import { Account } from "@/models/Account";
import { Debt } from "@/models/Debt";
import { DebtPayment } from "@/models/DebtPayment";
import {
  creditCardStatementDueDate,
  resolveCreditCardStatementDue,
  toCreditCardSummary,
} from "@/lib/financial/credit-cards";
import { resolveDebtDueWindowEnd } from "@/lib/financial/debts-due-split";
import {
  isDueOnFollowingPayday,
  resolveAllocationDebtWindow,
  resolvePaydayTargetCycle,
} from "@/lib/financial/pay-cycle-bounds";
import { resolvePeriodBounds, type Period } from "@/lib/financial/summary";
import type { Currency } from "@/types";

export {
  resolveDebtDueWindowEnd,
  splitInstallmentDebtLists,
  nextInstallmentDueDate,
  nextInstallmentAmount,
  isDueInDebtWindow,
} from "@/lib/financial/debts-due-split";
export type { DebtDashboardSplitItem } from "@/lib/financial/debts-due-split";

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

/**
 * Payments that count toward this period's due for one debt.
 * Ignores older installment payments when the window spans multiple months
 * (e.g. Oct settle must not clear a Dec due).
 */
export function paidTowardDue(input: {
  payments: Array<{ date: Date; amount: number }>;
  dueAmount: number;
  dueDate?: Date | null;
  rangeStart: Date;
}): number {
  if (input.dueAmount <= 0 || input.payments.length === 0) return 0;

  let attributionStart = input.rangeStart;
  if (input.dueDate) {
    const earliest = new Date(input.dueDate);
    earliest.setDate(earliest.getDate() - 40);
    if (earliest > attributionStart) attributionStart = earliest;
  }

  let paid = 0;
  for (const p of input.payments) {
    if (new Date(p.date) >= attributionStart) paid += p.amount;
  }
  return Math.min(paid, input.dueAmount);
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

  // Single-period payoff must track principal — stale plannedPayment
  // (e.g. after editing originalAmount) must not under-charge payslip.
  if (months === 1) {
    return {
      monthlyPayment: debt.remainingAmount,
      installmentMonths: 1,
    };
  }

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
    // No dueDate → treat as due this cycle (legacy). With a dueDate, only charge
    // when it falls in the window or is already overdue.
    const dueNow =
      !debt.dueDate ||
      isDueInPeriod(debt.dueDate, start, end) ||
      isOverdueBeforePeriodEnd(debt.dueDate, end);
    return {
      dueAmount: dueNow
        ? Math.min(derived.monthlyPayment, debt.remainingAmount)
        : 0,
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

  const paymentsByDebt = new Map<
    string,
    Array<{ date: Date; amount: number }>
  >();
  for (const p of payments) {
    const key = p.debtId.toString();
    const list = paymentsByDebt.get(key) ?? [];
    list.push({ date: new Date(p.date), amount: p.amount });
    paymentsByDebt.set(key, list);
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
      const statementDue = card
        ? resolveCreditCardStatementDue(card)
        : Math.max(
            0,
            debt.plannedPayment ?? debt.minimumPayment ?? 0
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

    // Skip empty obligations, but keep future-dated installments so the
    // dashboard can show next dues (dueAmount 0 until their window).
    if (
      dueAmount <= 0 &&
      !(isInstallment && debt.remainingAmount > 0 && monthlyPayment != null)
    ) {
      continue;
    }

    const debtId = debt._id.toString();
    const paidAmount = paidTowardDue({
      payments: paymentsByDebt.get(debtId) ?? [],
      dueAmount,
      dueDate: debt.dueDate ? new Date(debt.dueDate) : null,
      rangeStart: start,
    });
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

    if (dueAmount > 0) {
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
  }

  // Debit-mode (and other) CC accounts without a mirrored CREDIT_STATEMENT debt.
  const linkedCcIds = new Set(
    items
      .filter(
        (i) =>
          i.obligationType === "CREDIT_STATEMENT" && i.linkedAccountId
      )
      .map((i) => i.linkedAccountId!)
  );

  for (const account of ccAccounts) {
    const accountId = account._id.toString();
    if (linkedCcIds.has(accountId)) continue;

    const card = toCreditCardSummary(account);
    if (!card) continue;
    // Debit-mode cards always surface; other cards only when statement > 0.
    if (!card.debitMode && card.statementDueAmount <= 0) continue;
    if (card.debitMode && card.outstanding <= 0 && card.statementDueAmount <= 0) {
      continue;
    }

    const dueDate = creditCardStatementDueDate(
      card.statementDueDay,
      start,
      end
    );
    const dueNow =
      !card.statementDueDay ||
      (dueDate != null &&
        (isDueInPeriod(dueDate, start, end) ||
          isOverdueBeforePeriodEnd(dueDate, end)));

    const billAmount =
      card.statementDueAmount > 0
        ? card.statementDueAmount
        : card.outstanding;
    const dueAmount = dueNow ? billAmount : 0;
    if (dueAmount <= 0 && billAmount <= 0) continue;

    const currency = card.currency;
    items.push({
      debtId: `cc:${accountId}`,
      name: card.name,
      currency,
      dueAmount,
      paidAmount: 0,
      remainingDue: dueAmount,
      remainingAmount: card.outstanding,
      dueDate: dueDate?.toISOString(),
      monthlyPayment: billAmount > 0 ? billAmount : null,
      installmentMonths: null,
      isInstallment: true,
      obligationType: "CREDIT_STATEMENT",
      linkedAccountId: accountId,
    });

    if (dueAmount > 0) {
      const bucket = currencyTotals.get(currency) ?? {
        totalDue: 0,
        totalPaid: 0,
        totalRemaining: 0,
      };
      bucket.totalDue += dueAmount;
      bucket.totalRemaining += dueAmount;
      currencyTotals.set(currency, bucket);
    }
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
  const { cycle } = await resolvePeriodBounds(userId, period);
  // Align with Payday: mid-cycle show dues for the upcoming paycheck.
  const debtTarget = resolvePaydayTargetCycle(cycle.paydayDay, new Date(), "auto");
  const debtWindow = resolveAllocationDebtWindow(debtTarget.cycle);
  const due = await getDebtsDueInRange(
    userId,
    debtWindow.start,
    debtWindow.end,
    preferredCurrency
  );
  const items = due.items.filter(
    (d) => !isDueOnFollowingPayday(d.dueDate, debtTarget.cycle)
  );
  const totalDue = items.reduce((s, d) => s + d.dueAmount, 0);
  const totalPaid = items.reduce((s, d) => s + d.paidAmount, 0);
  const totalRemaining = items.reduce((s, d) => s + d.remainingDue, 0);
  return {
    period,
    ...due,
    items,
    totalDue,
    totalPaid,
    totalRemaining,
  };
}
