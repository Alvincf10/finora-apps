import {
  differenceInCalendarDays,
  endOfDay,
  startOfDay,
  subDays,
} from "date-fns";
import { Account } from "@/models/Account";
import { Transaction } from "@/models/Transaction";
import { User } from "@/models/User";
import { isLiabilityAccount } from "@/lib/financial/balances";
import { getFixedCostsInRange } from "@/lib/financial/fixed-costs";
import { getNextPayday } from "@/lib/financial/payday";
import {
  SURVIVAL_SAFE_RESERVE_DAYS,
  computeSurvivalFromCash,
} from "@/lib/financial/survival-math";
import type { AccountType, Currency } from "@/types";

export type SurvivalPlan = {
  paydayDay: number;
  nextPayday: string;
  daysLeft: number;
  cashOnHand: number;
  /** Fixed costs due before next payday (after current moment). */
  fixedCostsBeforePayday: number;
  /** Cash left for daily living after reserving those fixed costs. */
  spendableCash: number;
  spentToday: number;
  currency: Currency;
  dailyBudget: number;
  safeReserveDays: number;
  maxSafeGoalContribution: number;
  status: "ACTIVE" | "PAYDAY" | "NO_CASH";
};

export { getNextPayday };

export async function getSurvivalPlan(
  userId: string,
  now: Date = new Date()
): Promise<SurvivalPlan> {
  const user = await User.findById(userId).lean();
  const paydayDay = user?.paydayDay ?? 25;
  const currency = (user?.baseCurrency as Currency) ?? "IDR";
  const nextPayday = getNextPayday(paydayDay, now);
  const daysLeft = Math.max(
    0,
    differenceInCalendarDays(nextPayday, startOfDay(now))
  );

  // Fixed costs due from tomorrow through day before next payday.
  // Before payday 25, bills on 1/3/10/15/21 are AFTER payday → not reserved here.
  // After payday, those bills fall before next payday → reserved from cash.
  const reserveStart = startOfDay(now);
  const reserveEnd = endOfDay(subDays(nextPayday, 1));

  const [accounts, todayExpenses, fixedBeforePayday] = await Promise.all([
    Account.find({ userId, isActive: true }).lean(),
    Transaction.find({
      userId,
      type: "EXPENSE",
      date: { $gte: startOfDay(now), $lte: endOfDay(now) },
    }).lean(),
    daysLeft > 0
      ? getFixedCostsInRange(userId, reserveStart, reserveEnd, currency)
      : Promise.resolve({ items: [], total: 0, currency }),
  ]);

  let cashOnHand = 0;
  for (const account of accounts) {
    if (!isLiabilityAccount(account.type as AccountType)) {
      cashOnHand += Math.max(0, account.currentBalance);
    }
  }

  const fixedCostsBeforePayday = fixedBeforePayday.total;
  const spendableCash = Math.max(0, cashOnHand - fixedCostsBeforePayday);
  const spentToday = todayExpenses.reduce((sum, tx) => sum + tx.amount, 0);
  const { dailyBudget, maxSafeGoalContribution } = computeSurvivalFromCash(
    spendableCash,
    daysLeft
  );

  let status: SurvivalPlan["status"] = "ACTIVE";
  if (daysLeft === 0) status = "PAYDAY";
  else if (spendableCash <= 0) status = "NO_CASH";

  return {
    paydayDay,
    nextPayday: nextPayday.toISOString(),
    daysLeft,
    cashOnHand,
    fixedCostsBeforePayday,
    spendableCash,
    spentToday,
    currency,
    dailyBudget,
    safeReserveDays: SURVIVAL_SAFE_RESERVE_DAYS,
    maxSafeGoalContribution,
    status,
  };
}
