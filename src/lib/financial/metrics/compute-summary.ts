import { isLiabilityAccount } from "@/lib/financial/balances";
import { calculateEligibleLiquidBalance } from "@/lib/financial/shared/liquid-assets";
import { percent } from "@/lib/money";
import type { AccountType, Currency } from "@/types";
import type { MetricQualityFlag } from "@/lib/financial/metrics/types";

export type SummaryTxInput = {
  type: string;
  amount: number;
  currency: string;
  debtId?: unknown;
};

export type SummaryAccountInput = {
  type: string;
  currency: string;
  isActive?: boolean;
  currentBalance?: number | null;
};

export type SummaryDebtInput = {
  currency: string;
  remainingAmount: number;
  status?: string;
  obligationType?: string | null;
  linkedAccountId?: unknown;
};

export type ComputedFinancialSummary = {
  income: number;
  expense: number;
  debtPayment: number;
  netCashFlow: number;
  savings: number;
  /** null when income is zero — not a valid rate (FR-01.4). */
  savingsRate: number | null;
  debtRatio: number | null;
  totalAssets: number;
  liquidAssets: number;
  creditCardLiability: number;
  debtPrincipal: number;
  totalLiabilities: number;
  netWorth: number;
  currency: Currency;
  quality: MetricQualityFlag[];
};

/**
 * Pure, currency-scoped financial summary.
 * Transfers are ignored (only INCOME / EXPENSE).
 * CREDIT_STATEMENT debts linked to a CC account are not double-counted.
 */
export function computeFinancialSummaryMetrics(input: {
  currency: Currency;
  transactions: SummaryTxInput[];
  accounts: SummaryAccountInput[];
  debts: SummaryDebtInput[];
  /** True when user has accounts/txs in other currencies that were excluded. */
  mixedCurrencyExcluded?: boolean;
}): ComputedFinancialSummary {
  const { currency } = input;
  const quality: MetricQualityFlag[] = [];

  if (input.mixedCurrencyExcluded) {
    quality.push("MIXED_CURRENCY_EXCLUDED");
  }

  const txs = input.transactions.filter((t) => t.currency === currency);
  const accounts = input.accounts.filter(
    (a) => a.isActive !== false && a.currency === currency
  );
  const debts = input.debts.filter(
    (d) => d.currency === currency && (d.status == null || d.status === "ACTIVE")
  );

  if (accounts.length === 0) {
    quality.push("NO_ACCOUNTS");
  }

  let income = 0;
  let expense = 0;
  let debtPayment = 0;
  let missingBalance = false;

  for (const tx of txs) {
    if (tx.type === "INCOME") {
      income += tx.amount;
    } else if (tx.type === "EXPENSE") {
      expense += tx.amount;
      if (tx.debtId) debtPayment += tx.amount;
    }
  }

  const netCashFlow = income - expense;
  const savings = netCashFlow;
  let savingsRate: number | null;
  if (income > 0) {
    savingsRate = percent(savings, income);
  } else {
    savingsRate = null;
    quality.push("ZERO_INCOME");
  }
  const debtRatio = income > 0 ? percent(debtPayment, income) : null;

  let totalAssets = 0;
  let creditCardLiability = 0;

  for (const account of accounts) {
    if (account.currentBalance == null) missingBalance = true;
    const bal = account.currentBalance ?? 0;
    if (isLiabilityAccount(account.type as AccountType)) {
      creditCardLiability += Math.abs(bal);
    } else {
      totalAssets += bal;
    }
  }

  if (missingBalance) {
    quality.push("MISSING_BALANCE_TREATED_AS_ZERO");
  }

  const debtPrincipal = debts.reduce((sum, d) => {
    const isLinkedCcStatement =
      d.obligationType === "CREDIT_STATEMENT" && d.linkedAccountId;
    if (isLinkedCcStatement) return sum;
    return sum + d.remainingAmount;
  }, 0);

  const totalLiabilities = debtPrincipal + creditCardLiability;
  const liquidAssets = calculateEligibleLiquidBalance(accounts, currency);

  return {
    income,
    expense,
    debtPayment,
    netCashFlow,
    savings,
    savingsRate,
    debtRatio,
    totalAssets,
    liquidAssets,
    creditCardLiability,
    debtPrincipal,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    currency,
    quality,
  };
}

/** Resolve reporting currency: prefer base, else first active account, else IDR. */
export function resolveReportingCurrency(input: {
  baseCurrency?: Currency | null;
  accounts: Array<{ currency: string; isActive?: boolean }>;
}): { currency: Currency; fallback: boolean } {
  if (input.baseCurrency === "IDR" || input.baseCurrency === "EUR") {
    return { currency: input.baseCurrency, fallback: false };
  }
  const active = input.accounts.find((a) => a.isActive !== false);
  if (active?.currency === "IDR" || active?.currency === "EUR") {
    return { currency: active.currency, fallback: true };
  }
  return { currency: "IDR", fallback: true };
}

export function hasOtherCurrencies(
  currency: Currency,
  items: Array<{ currency: string; isActive?: boolean }>
): boolean {
  return items.some(
    (i) => i.isActive !== false && i.currency !== currency
  );
}
