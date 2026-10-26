import { User } from "@/models/User";
import { Account } from "@/models/Account";
import { Transaction } from "@/models/Transaction";
import { Debt } from "@/models/Debt";
import { SavingsGoal } from "@/models/SavingsGoal";
import {
  resolvePeriodBounds,
  type Period,
} from "@/lib/financial/summary";
import {
  computeFinancialSummaryMetrics,
  hasOtherCurrencies,
  resolveReportingCurrency,
} from "@/lib/financial/metrics/compute-summary";
import {
  calculateEmergencyCoverageMonths,
  resolveEmergencyReserve,
} from "@/lib/financial/shared/emergency-coverage";
import type {
  FinancialHealthSnapshot,
  MetricQualityFlag,
  MetricValue,
} from "@/lib/financial/metrics/types";
import type { Currency } from "@/types";

export const FINANCIAL_HEALTH_RULES_VERSION = "phase1-fr01-1";

export { resolveEmergencyReserve };

function metric<T>(
  value: T,
  unit: MetricValue<T>["unit"],
  opts: {
    currency?: Currency;
    available?: boolean;
    sources: string[];
    assumptions?: string[];
    quality?: MetricQualityFlag[];
  }
): MetricValue<T> {
  return {
    value,
    unit,
    currency: opts.currency,
    available: opts.available ?? (value !== null && value !== undefined),
    sources: opts.sources,
    assumptions: opts.assumptions ?? [],
    quality: opts.quality ?? [],
  };
}

export async function getFinancialHealth(
  userId: string,
  period: Period,
  opts?: { essentialMonthlyExpenses?: number | null }
): Promise<FinancialHealthSnapshot> {
  const { start, end, label } = await resolvePeriodBounds(userId, period);

  const [user, accounts, transactions, debts, emergencyGoals] =
    await Promise.all([
      User.findById(userId).select("baseCurrency").lean(),
      Account.find({ userId, isActive: true }).lean(),
      Transaction.find({
        userId,
        date: { $gte: start, $lte: end },
      }).lean(),
      Debt.find({ userId, status: "ACTIVE" }).lean(),
      SavingsGoal.find({
        userId,
        status: { $in: ["ACTIVE", "COMPLETED"] },
        goalType: "EMERGENCY_FUND",
      }).lean(),
    ]);

  const { currency, fallback } = resolveReportingCurrency({
    baseCurrency: user?.baseCurrency as Currency | undefined,
    accounts,
  });

  const mixed =
    hasOtherCurrencies(currency, accounts) ||
    hasOtherCurrencies(currency, transactions) ||
    hasOtherCurrencies(currency, debts);

  const computed = computeFinancialSummaryMetrics({
    currency,
    transactions,
    accounts,
    debts,
    mixedCurrencyExcluded: mixed,
  });

  const quality: MetricQualityFlag[] = [...computed.quality];
  if (fallback) quality.push("CURRENCY_FALLBACK");

  const emergencyGoalAmount =
    emergencyGoals
      .filter((g) => g.currency === currency)
      .reduce((sum, g) => sum + (g.currentAmount ?? 0), 0) || null;

  const reserve = resolveEmergencyReserve({
    emergencyGoalAmount,
    liquidAssets: computed.liquidAssets,
  });

  const essentials = opts?.essentialMonthlyExpenses ?? null;
  const coverage =
    essentials != null
      ? calculateEmergencyCoverageMonths(reserve.amount, essentials)
      : null;

  const coverageQuality: MetricQualityFlag[] = [];
  if (essentials == null || essentials <= 0) {
    // coverage unavailable — surface via available:false
  }

  const srcLedger = [
    "Transaction",
    "Account",
    "Debt",
    `currency:${currency}`,
    `period:pay_cycle`,
  ];

  return {
    period: {
      kind: "PAY_CYCLE",
      year: period.year,
      month: period.month,
      label,
      start: start.toISOString(),
      end: end.toISOString(),
    },
    currency,
    income: metric(computed.income, "MINOR", {
      currency,
      sources: srcLedger,
    }),
    expense: metric(computed.expense, "MINOR", {
      currency,
      sources: srcLedger,
      assumptions: ["Transfers excluded"],
    }),
    netCashFlow: metric(computed.netCashFlow, "MINOR", {
      currency,
      sources: ["income - expense"],
    }),
    savings: metric(computed.savings, "MINOR", {
      currency,
      sources: ["netCashFlow"],
      assumptions: ["Savings ≈ net cash flow for the cycle"],
    }),
    savingsRate: metric(computed.savingsRate, "PERCENT", {
      available: computed.savingsRate != null,
      sources: ["(income - expense) / income"],
      quality: computed.savingsRate == null ? ["ZERO_INCOME"] : [],
    }),
    totalAssets: metric(computed.totalAssets, "MINOR", {
      currency,
      sources: ["Account.currentBalance non-liability"],
      quality: computed.quality.filter((q) =>
        q === "MISSING_BALANCE_TREATED_AS_ZERO" || q === "NO_ACCOUNTS"
      ),
    }),
    liquidAssets: metric(computed.liquidAssets, "MINOR", {
      currency,
      sources: ["CASH+BANK+E_WALLET floored at 0"],
      assumptions: [
        "OTHER and CREDIT_CARD excluded",
        "Allocated payday envelopes not subtracted (default until FR-06)",
      ],
    }),
    totalLiabilities: metric(computed.totalLiabilities, "MINOR", {
      currency,
      sources: [
        "Debt.remainingAmount",
        "CREDIT_CARD outstanding",
        "CREDIT_STATEMENT linked debts excluded to avoid double count",
      ],
    }),
    netWorth: metric(computed.netWorth, "MINOR", {
      currency,
      sources: ["totalAssets - totalLiabilities"],
    }),
    debtPayment: metric(computed.debtPayment, "MINOR", {
      currency,
      sources: ["EXPENSE transactions with debtId"],
    }),
    debtRatio: metric(computed.debtRatio, "PERCENT", {
      available: computed.debtRatio != null,
      sources: ["debtPayment / income"],
    }),
    emergencyCoverageMonths: metric(coverage, "MONTHS", {
      available: coverage != null,
      sources: [
        reserve.source === "goal"
          ? "SavingsGoal EMERGENCY_FUND"
          : "liquidAssets fallback",
        "essentialMonthlyExpenses",
      ],
      assumptions: [
        "Reserve default: emergency goal if present, else liquid assets",
      ],
      quality: coverageQuality,
    }),
    quality: [...new Set(quality)],
    rulesVersion: FINANCIAL_HEALTH_RULES_VERSION,
    evaluatedAt: new Date().toISOString(),
  };
}
