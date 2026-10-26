import { subDays, startOfDay } from "date-fns";
import { Account } from "@/models/Account";
import { Debt } from "@/models/Debt";
import { FixedCost } from "@/models/FixedCost";
import { Transaction } from "@/models/Transaction";
import { User } from "@/models/User";
import { PaydayAllocation } from "@/models/PaydayAllocation";
import { calculateEligibleLiquidBalance } from "@/lib/financial/shared/liquid-assets";
import {
  getUserPaydayDay,
  getPayCycleBounds,
} from "@/lib/financial/pay-cycle";
import { getDebtsDueInRange } from "@/lib/financial/debts-due";
import {
  projectHorizonCashFlow,
  FORECAST_RULES_VERSION,
  toDateKey,
} from "@/lib/financial/forecast/cash-flow-forecast-math";
import {
  averageDailyVariableSpend,
  buildDebtEvents,
  buildFixedCostEvents,
  buildSalaryEvents,
  horizonEndDate,
} from "@/lib/financial/forecast/build-events";
import {
  resolveReportingCurrency,
  hasOtherCurrencies,
} from "@/lib/financial/metrics/compute-summary";
import type {
  ForecastHorizonDays,
  HorizonCashFlowForecast,
} from "@/lib/financial/forecast/types";
import type { Currency } from "@/types";

export { FORECAST_RULES_VERSION };

function dueDayFromDate(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.getDate();
}

/**
 * Deterministic 30/60/90-day cash-flow forecast (FR-02).
 * Read-only — never writes transactions, allocations, or balances.
 *
 * Income classes are explicit (salary settings ≠ certainty).
 * Debt and fixed costs are dated events; variable spend is a separate assumed daily burn
 * from expenses that are not debt/fixed-cost linked (avoids double-counting).
 */
export async function getHorizonCashFlowForecast(
  userId: string,
  horizonDays: ForecastHorizonDays = 30,
  asOfInput: Date = new Date()
): Promise<HorizonCashFlowForecast> {
  const asOf = startOfDay(asOfInput);
  const end = horizonEndDate(asOf, horizonDays);

  const [user, accounts, fixedCosts, paydayDay] = await Promise.all([
    User.findById(userId).lean(),
    Account.find({ userId, isActive: true }).lean(),
    FixedCost.find({ userId, isActive: true }).lean(),
    getUserPaydayDay(userId),
  ]);

  const { currency, fallback } = resolveReportingCurrency({
    baseCurrency: user?.baseCurrency as Currency | undefined,
    accounts,
  });

  const monthlySalary = Math.max(0, user?.monthlySalary ?? 0);
  const startingBalance = calculateEligibleLiquidBalance(accounts, currency);

  const lookbackDays = 30;
  const lookbackStart = subDays(asOf, lookbackDays);

  const [lookbackExpenses, debtsDueNear, activeAllocation, cycleTxs] =
    await Promise.all([
      Transaction.find({
        userId,
        type: "EXPENSE",
        currency,
        date: { $gte: lookbackStart, $lt: asOf },
      })
        .select("amount debtId fixedCostId")
        .lean(),
      getDebtsDueInRange(userId, asOf, end, currency),
      PaydayAllocation.findOne({
        userId,
        status: "ACTIVE",
        currency,
      })
        .sort({ cycleStart: -1 })
        .lean(),
      (async () => {
        const cycle = getPayCycleBounds(paydayDay, asOf);
        const txs = await Transaction.find({
          userId,
          currency,
          date: { $gte: cycle.start, $lte: cycle.end },
          type: { $in: ["INCOME", "EXPENSE"] },
        })
          .select("type amount")
          .lean();
        return { cycle, txs };
      })(),
    ]);

  const salary = buildSalaryEvents({
    paydayDay,
    monthlySalary,
    currency,
    asOf,
    horizonEnd: end,
  });

  const fixedEvents = buildFixedCostEvents(
    fixedCosts.map((c) => ({
      fixedCostId: c._id.toString(),
      name: c.name,
      amount: c.amount,
      currency: c.currency as Currency,
      dueDay: c.dueDay,
    })),
    currency,
    asOf,
    end
  );

  const dueById = new Map(
    debtsDueNear.items.map((d) => [d.debtId, d] as const)
  );

  const activeDebts = await Debt.find({ userId, status: "ACTIVE" }).lean();
  const debtEvents = buildDebtEvents(
    activeDebts.map((d) => {
      const id = d._id.toString();
      const near = dueById.get(id);
      return {
        debtId: id,
        name: d.name,
        currency: d.currency as Currency,
        remainingAmount: d.remainingAmount,
        remainingDue: near?.remainingDue,
        monthlyPayment:
          near?.monthlyPayment ??
          d.plannedPayment ??
          d.minimumPayment ??
          null,
        dueDay: dueDayFromDate(d.dueDate) ?? paydayDay,
        obligationType: d.obligationType,
      };
    }),
    currency,
    asOf,
    end
  );

  const dailyVariable = averageDailyVariableSpend(
    lookbackExpenses,
    lookbackDays
  );

  let incomeClass = salary.incomeClass;
  if (incomeClass === "NONE" && dailyVariable >= 0) {
    // No salary configured — income not invented from history for dated events
    incomeClass = "NONE";
  }

  const events = [...salary.events, ...fixedEvents, ...debtEvents];

  const assumptions = [
    `Horizon ${horizonDays} days from ${asOf.toISOString().slice(0, 10)}.`,
    `Starting balance = eligible liquid assets (${currency}) floored at 0 per account.`,
    incomeClass === "SCHEDULED_SALARY"
      ? "Salary events use Settings monthlySalary on weekend-adjusted payday — treated as scheduled assumption, not guaranteed receipt."
      : "No Settings monthlySalary — no salary inflow events were projected.",
    "Fixed costs projected on due-day occurrences in the horizon.",
    "Debt installments projected on due day; cumulative capped at remaining principal.",
    dailyVariable > 0
      ? `Daily variable spend assumption ${dailyVariable} ${currency}/day from last ${lookbackDays}d expenses excluding debt- and fixed-cost-linked txs.`
      : "No variable daily spend assumption (no unlinked expenses in lookback).",
    "Transfers are excluded from the forecast.",
  ];

  const limitations = [
    "Rule-based projection — not a probabilistic prediction.",
    "Does not model irregular income, one-off bonuses, or investment returns.",
    "Does not auto-apply Payday Allocation envelopes to ledger balances.",
    "Credit-card purchase timing may differ from statement due events.",
  ];

  if (fallback) {
    limitations.push("Reporting currency fell back (base currency unset).");
  }
  if (
    hasOtherCurrencies(currency, accounts) ||
    hasOtherCurrencies(currency, fixedCosts)
  ) {
    limitations.push(
      "Other currencies excluded from this forecast (no silent FX conversion)."
    );
  }

  let allocatedCash: number | null = null;
  let unallocatedHint: number | null = null;
  if (activeAllocation) {
    const allocated = (activeAllocation.envelopes ?? []).reduce(
      (sum: number, e: { amount?: number }) => sum + (e.amount ?? 0),
      0
    );
    allocatedCash = allocated;
    const salaryPart = activeAllocation.salary ?? 0;
    const startingCash = activeAllocation.startingCash ?? 0;
    unallocatedHint = salaryPart + startingCash - allocated;
    assumptions.push(
      `Active Payday Allocation detected (allocated=${allocated}). Allocation does not reserve account balances yet (FR-06 pending).`
    );
  }

  const { cycle, txs } = cycleTxs;
  let actualIncome = 0;
  let actualExpense = 0;
  for (const tx of txs) {
    if (tx.type === "INCOME") actualIncome += tx.amount;
    if (tx.type === "EXPENSE") actualExpense += tx.amount;
  }

  const cycleStartKey = toDateKey(cycle.start);
  const cycleEndKey = toDateKey(cycle.end);
  const inPayCycle = (date: string) =>
    date >= cycleStartKey && date <= cycleEndKey;

  const projectedIncome = salary.events
    .filter((e) => inPayCycle(e.date))
    .reduce((s, e) => s + e.amount, 0);

  const projectedExpense =
    fixedEvents.filter((e) => inPayCycle(e.date)).reduce((s, e) => s + e.amount, 0) +
    debtEvents.filter((e) => inPayCycle(e.date)).reduce((s, e) => s + e.amount, 0);

  const projected = projectHorizonCashFlow({
    currency,
    horizonDays,
    asOf,
    startingBalance,
    events,
    dailyVariableSpend: dailyVariable,
    incomeClass,
    assumptions,
    limitations,
    cycleComparison: {
      cycleLabel: cycle.label,
      actualIncome,
      actualExpense,
      actualNet: actualIncome - actualExpense,
      projectedIncome,
      projectedExpense,
      projectedNet: projectedIncome - projectedExpense,
    },
    allocatedCash,
    unallocatedHint,
  });

  return {
    ...projected,
    evaluatedAt: new Date().toISOString(),
  };
}

