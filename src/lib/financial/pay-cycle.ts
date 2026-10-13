import {
  endOfDay,
  endOfMonth,
  startOfDay,
  subDays,
  addMonths,
  setDate,
  max as maxDate,
} from "date-fns";
import { Account } from "@/models/Account";
import { Transaction } from "@/models/Transaction";
import { User } from "@/models/User";
import { isLiabilityAccount } from "@/lib/financial/balances";
import {
  getDebtsDueInRange,
  type DebtDueItem,
} from "@/lib/financial/debts-due";
import {
  getFixedCostsInRange,
  type FixedCostDueItem,
} from "@/lib/financial/fixed-costs";
import type { AccountType, Currency } from "@/types";

export type PayCycleBounds = {
  start: Date;
  end: Date;
  paydayDay: number;
  label: string;
};

/**
 * Pay cycle for salary buffer: payday → day before next payday.
 *
 * Uses this month's payday as the anchor (upcoming or already started),
 * so e.g. on 13 Okt with payday 25 → 25 Okt – 24 Nov.
 */
export function getPayCycleBounds(
  paydayDay: number,
  now: Date = new Date()
): PayCycleBounds {
  const day = Math.min(28, Math.max(1, paydayDay));
  const y = now.getFullYear();
  const m = now.getMonth();

  const cycleStart = startOfDay(setDate(new Date(y, m, 1), day));
  const nextPayday = startOfDay(setDate(addMonths(cycleStart, 1), day));
  const cycleEnd = endOfDay(subDays(nextPayday, 1));

  const label = `${cycleStart.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  })} – ${cycleEnd.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  return { start: cycleStart, end: cycleEnd, paydayDay: day, label };
}

export type PayCycleBuffer = {
  cycle: PayCycleBounds;
  currency: Currency;
  monthlySalary: number;
  startingBalance: number;
  otherIncome: number;
  expenses: number;
  debtDue: number;
  debtPaid: number;
  debtRemaining: number;
  debtItems: DebtDueItem[];
  fixedCostTotal: number;
  fixedCostItems: FixedCostDueItem[];
  buffer: number;
  configured: boolean;
};

export async function getPayCycleBuffer(
  userId: string,
  now: Date = new Date()
): Promise<PayCycleBuffer> {
  const user = await User.findById(userId).lean();
  const paydayDay = user?.paydayDay ?? 25;
  const monthlySalary = user?.monthlySalary ?? 0;
  const currency = (user?.baseCurrency as Currency) ?? "IDR";
  const cycle = getPayCycleBounds(paydayDay, now);

  const debtWindowEnd = maxDate([cycle.end, endOfMonth(cycle.end)]);

  const [accounts, transactions, debtsDue, fixedCosts] = await Promise.all([
    Account.find({ userId, isActive: true }).lean(),
    Transaction.find({
      userId,
      date: { $gte: cycle.start, $lte: cycle.end },
      type: { $in: ["INCOME", "EXPENSE"] },
    }).lean(),
    getDebtsDueInRange(userId, cycle.start, debtWindowEnd, currency),
    getFixedCostsInRange(userId, cycle.start, cycle.end, currency),
  ]);

  let currentCash = 0;
  for (const account of accounts) {
    if (!isLiabilityAccount(account.type as AccountType)) {
      currentCash += account.currentBalance;
    }
  }

  let otherIncome = 0;
  let expenses = 0;
  for (const tx of transactions) {
    if (tx.type === "INCOME") otherIncome += tx.amount;
    else if (tx.type === "EXPENSE") expenses += tx.amount;
  }

  let startingBalance = currentCash - otherIncome + expenses;
  if (currentCash === 0 && otherIncome === 0) {
    startingBalance = 0;
  }
  startingBalance = Math.max(0, startingBalance);

  const debtRemaining = debtsDue.totalRemaining;
  const fixedCostTotal = fixedCosts.total;
  const buffer =
    startingBalance +
    monthlySalary +
    otherIncome -
    expenses -
    debtRemaining -
    fixedCostTotal;

  return {
    cycle,
    currency,
    monthlySalary,
    startingBalance,
    otherIncome,
    expenses,
    debtDue: debtsDue.totalDue,
    debtPaid: debtsDue.totalPaid,
    debtRemaining,
    debtItems: debtsDue.items,
    fixedCostTotal,
    fixedCostItems: fixedCosts.items,
    buffer,
    configured: monthlySalary > 0,
  };
}
