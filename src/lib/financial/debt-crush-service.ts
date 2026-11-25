import { Account } from "@/models/Account";
import { Debt } from "@/models/Debt";
import { PaydayAllocation } from "@/models/PaydayAllocation";
import { User } from "@/models/User";
import { isLiabilityAccount } from "@/lib/financial/balances";
import {
  assessPaydayCompleteness,
  buildUpcomingCycles,
  computeCrushPlan,
  incomeRequiredToClear,
  type CrushPlanResult,
  type PaydayCompletenessResult,
} from "@/lib/financial/debt-crush-plan";
import { getFixedCostsInRange } from "@/lib/financial/fixed-costs";
import {
  suggestPaydayAllocation,
  type PaydayAllocationSuggestion,
} from "@/lib/financial/payday-allocation";
import type { AccountType, Currency } from "@/types";

export type DebtCrushPlanResponse = {
  currency: Currency;
  paydayDay: number;
  defaults: {
    income: number;
    livingCap: number;
    fixedCostsPerCycle: number;
    startingCash: number;
    separateLiability: number;
    cycleCount: number;
  };
  plan: CrushPlanResult;
  /** Income needed to keep livingCap and clear separate liability. */
  incomeRequiredToClear: number;
  completeness: PaydayCompletenessResult;
  payday: {
    target: PaydayAllocationSuggestion["target"];
    cycleLabel: string;
    existingStatus: PaydayAllocationSuggestion["existingStatus"];
  };
};

export async function getDebtCrushPlan(
  userId: string,
  options: {
    income?: number;
    livingCap?: number;
    cycleCount?: number;
    includeSeparateLiability?: boolean;
    paySeparateLiabilityFromSurplus?: boolean;
    fromTarget?: "current" | "next";
    now?: Date;
  } = {}
): Promise<DebtCrushPlanResponse> {
  const now = options.now ?? new Date();
  const cycleCount = Math.min(6, Math.max(1, options.cycleCount ?? 3));
  const fromTarget = options.fromTarget ?? "next";

  const [user, debts, accounts, suggestion] = await Promise.all([
    User.findById(userId).lean(),
    Debt.find({ userId, status: "ACTIVE" }).lean(),
    Account.find({ userId, isActive: true }).lean(),
    suggestPaydayAllocation(userId, now, {
      ignoreSaved: true,
      target: fromTarget,
    }),
  ]);

  const paydayDay = user?.paydayDay ?? 25;
  const currency = (user?.baseCurrency as Currency) ?? "IDR";
  const baseIncome = user?.monthlySalary ?? suggestion.salary ?? 0;
  const income = options.income ?? baseIncome;

  const cycles = buildUpcomingCycles(paydayDay, cycleCount, now, fromTarget);
  const first = cycles[0];
  const fixedCosts = first
    ? await getFixedCostsInRange(userId, first.start, first.end, currency)
    : { total: 0 };

  const startingCash = accounts.reduce((sum, account) => {
    if (isLiabilityAccount(account.type as AccountType)) return sum;
    if (/fixed/i.test(account.name ?? "")) return sum;
    return sum + Math.max(0, account.currentBalance ?? 0);
  }, 0);

  const ccBalance = accounts.reduce((sum, account) => {
    if ((account.type as AccountType) !== "CREDIT_CARD") return sum;
    return sum + Math.max(0, account.currentBalance ?? 0);
  }, 0);

  const includeCc = options.includeSeparateLiability !== false;
  const separateLiability = includeCc ? ccBalance : 0;
  const livingCap = options.livingCap ?? Math.max(0, Math.round(income * 0.27));

  const crushDebts = debts
    .filter((d) => d.currency === currency)
    .map((d) => ({
      debtId: d._id.toString(),
      name: d.name,
      remainingAmount: d.remainingAmount,
      plannedPayment: d.plannedPayment,
      minimumPayment: d.minimumPayment,
      installmentMonths: d.installmentMonths,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      excludeFromCrush: d.kind === "MORTGAGE",
    }));

  const plan = computeCrushPlan({
    debts: crushDebts,
    cycles,
    income,
    fixedCostsPerCycle: fixedCosts.total,
    livingCap,
    startingCash,
    separateLiability,
    paySeparateLiabilityFromSurplus:
      options.paySeparateLiabilityFromSurplus !== false,
  });

  const needed = incomeRequiredToClear({
    debts: crushDebts,
    cycles,
    fixedCostsPerCycle: fixedCosts.total,
    livingCap,
    startingCash,
    separateLiability,
  });

  // Completeness: raw saved envelopes (not merged suggestion) vs auto expected.
  const existing = await PaydayAllocation.findOne({
    userId,
    cycleStart: new Date(suggestion.cycle.start),
  }).lean();
  const completeness = assessPaydayCompleteness({
    salary: existing?.salary ?? suggestion.salary,
    startingCash: existing?.startingCash ?? suggestion.startingCash,
    expected: suggestion.envelopes.map((e) => ({
      key: e.key,
      label: e.label,
      amount: e.amount,
      kind: e.kind,
    })),
    saved: (existing?.envelopes ?? []).map(
      (e: { key: string; label: string; amount: number; kind?: string }) => ({
        key: e.key,
        label: e.label,
        amount: e.amount,
        kind: e.kind ?? "OTHER",
      })
    ),
  });

  return {
    currency,
    paydayDay,
    defaults: {
      income: baseIncome,
      livingCap,
      fixedCostsPerCycle: fixedCosts.total,
      startingCash,
      separateLiability,
      cycleCount,
    },
    plan,
    incomeRequiredToClear: needed,
    completeness,
    payday: {
      target: suggestion.target,
      cycleLabel: suggestion.cycle.label,
      existingStatus:
        (existing?.status as PaydayAllocationSuggestion["existingStatus"]) ??
        null,
    },
  };
}
