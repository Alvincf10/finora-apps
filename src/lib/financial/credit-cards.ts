import { Account } from "@/models/Account";
import {
  creditAvailable,
  creditUtilizationPct,
  isLiabilityAccount,
} from "@/lib/financial/balances";
import type { AccountType, Currency } from "@/types";

export type CreditCardSummary = {
  accountId: string;
  name: string;
  currency: Currency;
  creditLimit: number;
  outstanding: number;
  available: number;
  utilizationPct: number | null;
  statementDueAmount: number;
  statementDueDay: number | null;
  debitMode: boolean;
};

/**
 * Amount to pay this statement period.
 * Debit-mode: unset/0 statement → fall back to outstanding (pay what you spent).
 * Normal CC: unset → outstanding; explicit 0 → 0.
 */
export function resolveCreditCardStatementDue(account: {
  currentBalance?: number | null;
  statementDueAmount?: number | null;
  debitMode?: boolean | null;
}): number {
  const outstanding = Math.max(0, account.currentBalance ?? 0);
  const raw = account.statementDueAmount;
  if (account.debitMode) {
    if (raw == null || raw <= 0) return outstanding;
    return Math.min(outstanding, raw);
  }
  return Math.min(outstanding, Math.max(0, raw ?? outstanding));
}

/**
 * Statement-due calendar day inside [start, end].
 * Prefers the latest match so post-payday dues (e.g. Nov 25 after a
 * cycle ending Nov 24) win over an earlier day in the same window.
 */
export function creditCardStatementDueDate(
  day: number | null | undefined,
  start: Date,
  end: Date
): Date | undefined {
  if (day == null || day < 1 || day > 31) return undefined;
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  let found: Date | undefined;
  while (cursor <= lastMonth) {
    const dim = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      0
    ).getDate();
    const due = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      Math.min(day, dim),
      12,
      0,
      0,
      0
    );
    if (due >= start && due <= end) found = due;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return found;
}

export function toCreditCardSummary(account: {
  _id: { toString(): string };
  name: string;
  type: string;
  currency: string;
  creditLimit?: number | null;
  currentBalance?: number | null;
  statementDueAmount?: number | null;
  statementDueDay?: number | null;
  debitMode?: boolean | null;
}): CreditCardSummary | null {
  if (!isLiabilityAccount(account.type as AccountType)) return null;

  const creditLimit = Math.max(0, account.creditLimit ?? 0);
  const outstanding = Math.max(0, account.currentBalance ?? 0);
  const statementDueAmount = resolveCreditCardStatementDue(account);

  return {
    accountId: account._id.toString(),
    name: account.name,
    currency: account.currency as Currency,
    creditLimit,
    outstanding,
    available: creditAvailable({
      type: account.type as AccountType,
      creditLimit,
      currentBalance: outstanding,
    }) ?? 0,
    utilizationPct: creditUtilizationPct({
      type: account.type as AccountType,
      creditLimit,
      currentBalance: outstanding,
    }),
    statementDueAmount,
    statementDueDay: account.statementDueDay ?? null,
    debitMode: Boolean(account.debitMode),
  };
}

export async function getCreditCardsForUser(
  userId: string
): Promise<CreditCardSummary[]> {
  const accounts = await Account.find({
    userId,
    isActive: true,
    type: "CREDIT_CARD",
  }).lean();

  return accounts
    .map((a) => toCreditCardSummary(a))
    .filter((a): a is CreditCardSummary => a != null);
}
