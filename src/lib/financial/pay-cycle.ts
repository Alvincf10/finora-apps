import {
  endOfDay,
  endOfMonth,
  startOfDay,
  subDays,
  addMonths,
  max as maxDate,
} from "date-fns";
import { Account } from "@/models/Account";
import { Transaction } from "@/models/Transaction";
import { User } from "@/models/User";
import { Category } from "@/models/Category";
import { PaydayAllocation } from "@/models/PaydayAllocation";
import { isLiabilityAccount } from "@/lib/financial/balances";
import {
  getDebtsDueInRange,
  type DebtDueItem,
} from "@/lib/financial/debts-due";
import {
  getFixedCostsInRange,
  type FixedCostDueItem,
} from "@/lib/financial/fixed-costs";
import { percent } from "@/lib/money";
import { resolvePaydayInMonth } from "@/lib/financial/payday";
import type { AccountType, Currency } from "@/types";

/** Legacy tag from when salary was auto-posted to the ledger. */
const AUTO_SALARY_TAG = "auto-salary";

export type PayCycleBounds = {
  start: Date;
  end: Date;
  paydayDay: number;
  label: string;
};

/**
 * Pay cycle that contains `now`: payday → day before next payday.
 *
 * Weekend rule: if nominal payday falls Sat/Sun → previous Friday.
 * Next month weekday stays as-is.
 *
 * e.g. paydayDay 25, on 5 Nov 2026:
 *   Oct 25 = Sunday → start 23 Okt; Nov 25 = Wednesday → end 24 Nov.
 * e.g. on 13 Okt 2026 (before 23 Okt payday): still previous cycle
 *   Sep 25 → … – 22 Okt.
 */
export function getPayCycleBounds(
  paydayDay: number,
  now: Date = new Date()
): PayCycleBounds {
  const day = Math.min(28, Math.max(1, paydayDay));
  const today = startOfDay(now);
  const y = now.getFullYear();
  const m = now.getMonth();

  const thisMonthPayday = resolvePaydayInMonth(day, y, m);

  let cycleStart: Date;
  let nextPayday: Date;

  if (today.getTime() >= thisMonthPayday.getTime()) {
    cycleStart = thisMonthPayday;
    const nextMonth = addMonths(new Date(y, m, 1), 1);
    nextPayday = resolvePaydayInMonth(
      day,
      nextMonth.getFullYear(),
      nextMonth.getMonth()
    );
  } else {
    const prevMonth = addMonths(new Date(y, m, 1), -1);
    cycleStart = resolvePaydayInMonth(
      day,
      prevMonth.getFullYear(),
      prevMonth.getMonth()
    );
    nextPayday = thisMonthPayday;
  }

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

export type PeriodRef = { year: number; month: number };

/**
 * Pay cycle for the payday that falls in `period`'s calendar month.
 * e.g. {2026,10} + paydayDay 25 → 23 Okt – 24 Nov 2026 (weekend-adjusted).
 */
export function getPayCycleForPeriod(
  paydayDay: number,
  period: PeriodRef
): PayCycleBounds {
  const day = Math.min(28, Math.max(1, paydayDay));
  const y = period.year;
  const m = period.month - 1; // 0-indexed
  const cycleStart = resolvePaydayInMonth(day, y, m);
  const nextMonth = addMonths(new Date(y, m, 1), 1);
  const nextPayday = resolvePaydayInMonth(
    day,
    nextMonth.getFullYear(),
    nextMonth.getMonth()
  );
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

/** Period key = calendar month of the cycle's payday (start). */
export function periodFromDate(
  paydayDay: number,
  now: Date = new Date()
): PeriodRef {
  const cycle = getPayCycleBounds(paydayDay, now);
  return {
    year: cycle.start.getFullYear(),
    month: cycle.start.getMonth() + 1,
  };
}

export function shiftPeriodRef(
  period: PeriodRef,
  monthsBack: number
): PeriodRef {
  const d = addMonths(new Date(period.year, period.month - 1, 1), -monthsBack);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Days elapsed / total in a cycle (for projections). */
export function getCycleProgress(
  cycle: PayCycleBounds,
  now: Date = new Date()
): { elapsedDays: number; totalDays: number; isCurrent: boolean } {
  const startMs = cycle.start.getTime();
  const endMs = cycle.end.getTime();
  const nowMs = now.getTime();
  const totalMs = Math.max(1, endMs - startMs);
  const totalDays = Math.max(1, Math.ceil(totalMs / 86_400_000));
  const isCurrent = nowMs >= startMs && nowMs <= endMs;
  if (!isCurrent) {
    return { elapsedDays: totalDays, totalDays, isCurrent: false };
  }
  const elapsedDays = Math.max(
    1,
    Math.min(totalDays, Math.ceil((nowMs - startMs) / 86_400_000))
  );
  return { elapsedDays, totalDays, isCurrent: true };
}

export async function getUserPaydayDay(userId: string): Promise<number> {
  const user = await User.findById(userId).select("paydayDay").lean();
  return Math.min(28, Math.max(1, user?.paydayDay ?? 25));
}

export type CycleExpenseTopItem = {
  label: string;
  amount: number;
};

export type CycleExpenseBreakdownRow = {
  categoryId: string;
  name: string;
  amount: number;
  pct: number;
  topItems: CycleExpenseTopItem[];
};

function txLabel(tx: {
  description?: string | null;
  merchant?: string | null;
}): string {
  const desc = (tx.description ?? "").trim();
  const merchant = (tx.merchant ?? "").trim();
  if (desc && merchant && desc.toLowerCase() !== merchant.toLowerCase()) {
    return `${desc} · ${merchant}`;
  }
  return desc || merchant || "Tanpa deskripsi";
}

/** Expense by category inside a pay cycle, with share % and top 3 txs. */
export async function getCycleExpenseBreakdown(
  userId: string,
  start: Date,
  end: Date
): Promise<CycleExpenseBreakdownRow[]> {
  const txs = await Transaction.find({
    userId,
    type: "EXPENSE",
    date: { $gte: start, $lte: end },
  }).lean();

  const byCategory = new Map<string, number>();
  const itemsByCategory = new Map<string, CycleExpenseTopItem[]>();

  for (const tx of txs) {
    const key = tx.categoryId?.toString() ?? "uncategorized";
    byCategory.set(key, (byCategory.get(key) ?? 0) + tx.amount);
    const list = itemsByCategory.get(key) ?? [];
    list.push({ label: txLabel(tx), amount: tx.amount });
    itemsByCategory.set(key, list);
  }

  const total = [...byCategory.values()].reduce((s, v) => s + v, 0);
  const categoryIds = [...byCategory.keys()].filter((id) => id !== "uncategorized");
  const categories = await Category.find({ _id: { $in: categoryIds } }).lean();
  const nameMap = new Map(categories.map((c) => [c._id.toString(), c.name as string]));

  return [...byCategory.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      name:
        categoryId === "uncategorized"
          ? "Uncategorized"
          : (nameMap.get(categoryId) ?? "Unknown"),
      amount,
      pct: percent(amount, total),
      topItems: [...(itemsByCategory.get(categoryId) ?? [])]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3),
    }))
    .sort((a, b) => b.amount - a.amount);
}

export type PayCycleBuffer = {
  cycle: PayCycleBounds;
  currency: Currency;
  /** Effective salary for this cycle (allocation override if saved, else Settings). */
  monthlySalary: number;
  /** Settings.monthlySalary — routine base, may differ from monthlySalary. */
  baseSalary: number;
  /** True when PaydayAllocation.salary is used instead of Settings. */
  salaryFromAllocation: boolean;
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

/** True when an INCOME tx is the paycheck already counted via Settings/allocation. */
function isLoggedSalaryIncome(
  tx: {
    amount: number;
    categoryId?: { toString(): string } | null;
    description?: string | null;
    merchant?: string | null;
    tags?: string[] | null;
  },
  salaryCategoryIds: Set<string>,
  monthlySalary: number
): boolean {
  if (tx.tags?.includes(AUTO_SALARY_TAG)) return true;
  if (
    tx.categoryId &&
    salaryCategoryIds.has(tx.categoryId.toString())
  ) {
    return true;
  }
  // Same nominal as Settings salary — common when user records the deposit.
  if (monthlySalary > 0 && tx.amount === monthlySalary) {
    return true;
  }
  const text = `${tx.description ?? ""} ${tx.merchant ?? ""}`.toLowerCase();
  return /\b(gaji|salary|payroll)\b/.test(text);
}

export async function getPayCycleBuffer(
  userId: string,
  now: Date = new Date()
): Promise<PayCycleBuffer> {
  const user = await User.findById(userId).lean();
  const paydayDay = user?.paydayDay ?? 25;
  const baseSalary = user?.monthlySalary ?? 0;
  const currency = (user?.baseCurrency as Currency) ?? "IDR";
  const cycle = getPayCycleBounds(paydayDay, now);

  const debtWindowEnd = maxDate([cycle.end, endOfMonth(cycle.end)]);

  const allocation = await PaydayAllocation.findOne({
    userId,
    cycleStart: cycle.start,
  })
    .select("salary")
    .lean();

  // Prefer cycle override from Alokasi gajian when saved; else Settings base.
  // Settings salary is planning only — actual deposit is a manual INCOME tx.
  const salaryFromAllocation =
    allocation != null && typeof allocation.salary === "number";
  const monthlySalary = salaryFromAllocation
    ? Math.max(0, allocation!.salary)
    : baseSalary;

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

  // Planning salary comes from Settings/allocation — do not also count
  // matching salary income txs as "other income" (would double-count).
  const incomeCategoryIds = [
    ...new Set(
      transactions
        .filter((tx) => tx.type === "INCOME" && tx.categoryId)
        .map((tx) => tx.categoryId!.toString())
    ),
  ];
  const incomeCategories =
    incomeCategoryIds.length > 0
      ? await Category.find({ _id: { $in: incomeCategoryIds } })
          .select("name")
          .lean()
      : [];
  const salaryCategoryIds = new Set(
    incomeCategories
      .filter((c) => /^salary$/i.test(String(c.name ?? "").trim()))
      .map((c) => c._id.toString())
  );

  let otherIncome = 0;
  /** Manual salary income txs (backed out of cash reconstruction only). */
  let salaryIncomeLogged = 0;
  let expenses = 0;
  for (const tx of transactions) {
    if (tx.type === "INCOME") {
      if (isLoggedSalaryIncome(tx, salaryCategoryIds, monthlySalary)) {
        salaryIncomeLogged += tx.amount;
      } else {
        otherIncome += tx.amount;
      }
    } else if (tx.type === "EXPENSE") {
      expenses += tx.amount;
    }
  }

  // Reconstruct cash at cycle start: undo all income (incl. logged salary) and expenses.
  let startingBalance =
    currentCash - otherIncome - salaryIncomeLogged + expenses;
  if (currentCash === 0 && otherIncome === 0 && salaryIncomeLogged === 0) {
    startingBalance = 0;
  }
  startingBalance = Math.max(0, startingBalance);

  const debtRemaining = debtsDue.totalRemaining;
  const fixedCostTotal = fixedCosts.total;
  // monthlySalary covers the paycheck; salaryIncomeLogged is only for cash reconstruction.
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
    baseSalary,
    salaryFromAllocation,
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
    configured: monthlySalary > 0 || baseSalary > 0,
  };
}
