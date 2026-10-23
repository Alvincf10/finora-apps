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
  const statementDueAmount = Math.min(
    outstanding,
    Math.max(0, account.statementDueAmount ?? outstanding)
  );

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
