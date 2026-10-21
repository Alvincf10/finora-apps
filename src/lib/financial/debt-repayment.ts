import { calculateDebtScenario } from "@/lib/financial/phase2-math";
import type { Currency } from "@/types";

/** Max share of income that is still considered a reasonable debt burden. */
export const REASONABLE_DEBT_BURDEN_PCT = 30;

export type DebtForSimulation = {
  debtId: string;
  name: string;
  remainingAmount: number;
  currency: Currency;
  interestRate?: number | null;
  plannedPayment?: number | null;
  minimumPayment?: number | null;
  installmentMonths?: number | null;
  dueDate?: string | Date | null;
};

export type RepaymentStrategy = "SNOWBALL" | "AVALANCHE" | "PROPORTIONAL";

export type DebtAllocation = {
  debtId: string;
  name: string;
  currency: Currency;
  remainingAmount: number;
  minimumDue: number;
  allocatedPayment: number;
  extraPayment: number;
  estimatedMonths: number | null;
  remainingInstallments: number | null;
  note?: string;
};

export type DebtRepaymentSimulation = {
  currency: Currency;
  strategy: RepaymentStrategy;
  monthlyBudget: number;
  minimumTotal: number;
  allocatedTotal: number;
  leftoverBudget: number;
  income: number | null;
  spareCashFlow: number | null;
  reasonableCap: number | null;
  burdenPercent: number | null;
  withinReasonableLimit: boolean;
  estimatedMonthsToClearAll: number | null;
  allocations: DebtAllocation[];
  tips: string[];
};

export function monthlyInstallment(debt: DebtForSimulation): number {
  return debt.plannedPayment ?? debt.minimumPayment ?? 0;
}

export function remainingInstallments(debt: DebtForSimulation): number | null {
  const installment = monthlyInstallment(debt);
  if (debt.remainingAmount <= 0) return 0;
  if (installment > 0) {
    return Math.max(1, Math.ceil(debt.remainingAmount / installment));
  }
  if (debt.installmentMonths != null && debt.installmentMonths > 0) {
    // Without a monthly amount, trust declared tenor as remaining estimate.
    return debt.installmentMonths;
  }
  return null;
}

function sortForStrategy(
  debts: DebtForSimulation[],
  strategy: RepaymentStrategy
): DebtForSimulation[] {
  const copy = [...debts];
  if (strategy === "SNOWBALL") {
    copy.sort((a, b) => a.remainingAmount - b.remainingAmount);
  } else if (strategy === "AVALANCHE") {
    copy.sort((a, b) => {
      const rateDiff = (b.interestRate ?? 0) - (a.interestRate ?? 0);
      if (rateDiff !== 0) return rateDiff;
      return b.remainingAmount - a.remainingAmount;
    });
  } else {
    copy.sort((a, b) => b.remainingAmount - a.remainingAmount);
  }
  return copy;
}

/**
 * Simulate how a monthly budget should be split across debts.
 * Always covers each debt's minimum/cicilan first, then applies leftover
 * according to the chosen strategy (like consumer debt payoff apps).
 */
export function simulateDebtRepayment(input: {
  debts: DebtForSimulation[];
  monthlyBudget: number;
  strategy?: RepaymentStrategy;
  income?: number | null;
  spareCashFlow?: number | null;
  currency: Currency;
}): DebtRepaymentSimulation {
  const strategy = input.strategy ?? "SNOWBALL";
  const currency = input.currency;
  const debts = input.debts.filter(
    (d) => d.remainingAmount > 0 && d.currency === currency
  );
  const budget = Math.max(0, Math.floor(input.monthlyBudget));
  const income = input.income ?? null;
  const spareCashFlow = input.spareCashFlow ?? null;

  const mins = new Map<string, number>();
  let minimumTotal = 0;
  for (const debt of debts) {
    const installment = monthlyInstallment(debt);
    const minDue = Math.min(
      debt.remainingAmount,
      installment > 0
        ? installment
        : Math.ceil(debt.remainingAmount / 12) || debt.remainingAmount
    );
    mins.set(debt.debtId, minDue);
    minimumTotal += minDue;
  }

  const allocations = new Map<string, number>();
  for (const debt of debts) {
    allocations.set(debt.debtId, 0);
  }

  let remainingBudget = budget;

  // Pass 1: cover minimums proportionally if budget is too small.
  if (budget < minimumTotal && minimumTotal > 0) {
    for (const debt of debts) {
      const minDue = mins.get(debt.debtId) ?? 0;
      const share = Math.floor((budget * minDue) / minimumTotal);
      const pay = Math.min(debt.remainingAmount, share);
      allocations.set(debt.debtId, pay);
      remainingBudget -= pay;
    }
    // Distribute leftover rounding to largest remaining min gap.
    const ordered = sortForStrategy(debts, strategy);
    for (const debt of ordered) {
      if (remainingBudget <= 0) break;
      const current = allocations.get(debt.debtId) ?? 0;
      const minDue = mins.get(debt.debtId) ?? 0;
      const gap = Math.min(debt.remainingAmount, minDue) - current;
      if (gap <= 0) continue;
      const add = Math.min(gap, remainingBudget);
      allocations.set(debt.debtId, current + add);
      remainingBudget -= add;
    }
  } else {
    for (const debt of debts) {
      const minDue = mins.get(debt.debtId) ?? 0;
      allocations.set(debt.debtId, minDue);
      remainingBudget -= minDue;
    }

    if (strategy === "PROPORTIONAL" && remainingBudget > 0) {
      const open = debts.filter((d) => {
        const paid = allocations.get(d.debtId) ?? 0;
        return d.remainingAmount - paid > 0;
      });
      const openTotal = open.reduce(
        (sum, d) => sum + (d.remainingAmount - (allocations.get(d.debtId) ?? 0)),
        0
      );
      if (openTotal > 0) {
        let left = remainingBudget;
        for (const debt of open) {
          const room =
            debt.remainingAmount - (allocations.get(debt.debtId) ?? 0);
          const share = Math.floor((remainingBudget * room) / openTotal);
          const add = Math.min(room, share, left);
          allocations.set(debt.debtId, (allocations.get(debt.debtId) ?? 0) + add);
          left -= add;
        }
        remainingBudget = left;
      }
    } else {
      const ordered = sortForStrategy(debts, strategy);
      for (const debt of ordered) {
        if (remainingBudget <= 0) break;
        const current = allocations.get(debt.debtId) ?? 0;
        const room = debt.remainingAmount - current;
        if (room <= 0) continue;
        const add = Math.min(room, remainingBudget);
        allocations.set(debt.debtId, current + add);
        remainingBudget -= add;
      }
    }
  }

  const resultAllocations: DebtAllocation[] = debts.map((debt) => {
    const allocatedPayment = allocations.get(debt.debtId) ?? 0;
    const minimumDue = mins.get(debt.debtId) ?? 0;
    const scenario = calculateDebtScenario(
      debt.remainingAmount,
      allocatedPayment,
      debt.interestRate ?? null
    );
    return {
      debtId: debt.debtId,
      name: debt.name,
      currency: debt.currency,
      remainingAmount: debt.remainingAmount,
      minimumDue,
      allocatedPayment,
      extraPayment: Math.max(0, allocatedPayment - minimumDue),
      estimatedMonths: scenario.estimatedMonths,
      remainingInstallments: remainingInstallments(debt),
      note: scenario.note,
    };
  });

  resultAllocations.sort((a, b) => b.allocatedPayment - a.allocatedPayment);

  const allocatedTotal = resultAllocations.reduce(
    (sum, a) => sum + a.allocatedPayment,
    0
  );

  const months = resultAllocations
    .map((a) => a.estimatedMonths)
    .filter((m): m is number => m != null && m > 0);
  const estimatedMonthsToClearAll =
    months.length === resultAllocations.length && months.length > 0
      ? Math.max(...months)
      : months.length > 0
        ? Math.max(...months)
        : null;

  const reasonableCap =
    income != null && income > 0
      ? Math.round((income * REASONABLE_DEBT_BURDEN_PCT) / 100)
      : spareCashFlow != null && spareCashFlow > 0
        ? spareCashFlow
        : null;

  const burdenPercent =
    income != null && income > 0
      ? Math.round((allocatedTotal / income) * 1000) / 10
      : null;

  const withinReasonableLimit =
    reasonableCap == null ? allocatedTotal <= budget : allocatedTotal <= reasonableCap;

  const tips: string[] = [];
  if (budget < minimumTotal) {
    tips.push(
      `Budget di bawah total cicilan minimum (${minimumTotal}). Prioritaskan bayar minimum dulu, atau naikkan budget.`
    );
  }
  if (reasonableCap != null && budget > reasonableCap) {
    tips.push(
      `Batas wajar ≈ ${REASONABLE_DEBT_BURDEN_PCT}% penghasilan / sisa cash flow: ${reasonableCap}. Budget di atas itu berisiko menekan biaya hidup.`
    );
  }
  if (
    spareCashFlow != null &&
    spareCashFlow >= 0 &&
    budget > spareCashFlow
  ) {
    tips.push(
      `Budget melebihi sisa uang bulanan perkiraan (${spareCashFlow}). Turunkan cicilan ekstra agar tidak defisit.`
    );
  }
  if (withinReasonableLimit && budget >= minimumTotal && allocatedTotal > 0) {
    tips.push(
      strategy === "SNOWBALL"
        ? "Strategi snowball: ekstra dialihkan ke utang terkecil dulu — momentum cepat lunas."
        : strategy === "AVALANCHE"
          ? "Strategi avalanche: ekstra ke bunga tertinggi / saldo terbesar — hemat bunga."
          : "Strategi proporsional: ekstra dibagi sesuai sisa saldo masing-masing."
    );
  }
  if (estimatedMonthsToClearAll != null) {
    tips.push(
      `Perkiraan semua utang (${currency}) lunas dalam ±${estimatedMonthsToClearAll} bulan dengan alokasi ini.`
    );
  }

  return {
    currency,
    strategy,
    monthlyBudget: budget,
    minimumTotal,
    allocatedTotal,
    leftoverBudget: Math.max(0, budget - allocatedTotal),
    income,
    spareCashFlow,
    reasonableCap,
    burdenPercent,
    withinReasonableLimit,
    estimatedMonthsToClearAll,
    allocations: resultAllocations,
    tips,
  };
}

export function suggestedAffordableBudget(input: {
  income: number;
  spareCashFlow: number;
  minimumTotal: number;
}): number {
  const byBurden =
    input.income > 0
      ? Math.round((input.income * REASONABLE_DEBT_BURDEN_PCT) / 100)
      : 0;
  const bySpare = Math.max(0, input.spareCashFlow);
  const caps = [byBurden, bySpare].filter((n) => n > 0);
  const softCap = caps.length > 0 ? Math.min(...caps) : byBurden || bySpare;
  return Math.max(input.minimumTotal, softCap);
}
