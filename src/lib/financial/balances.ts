import mongoose from "mongoose";
import { Account } from "@/models/Account";
import { Transaction } from "@/models/Transaction";
import type { AccountType } from "@/types";

const LIABILITY_TYPES: AccountType[] = ["CREDIT_CARD"];

/**
 * Apply one transaction's effect onto a running balance.
 * CREDIT_CARD balances are outstanding owed (positive = you owe):
 * charges increase debt; payments / transfer-in decrease debt.
 */
export function applyTransactionEffect(
  balance: number,
  tx: {
    type: string;
    amount: number;
    transferDirection?: string | null;
  },
  accountType: AccountType
): number {
  const liability = isLiabilityAccount(accountType);

  if (tx.type === "INCOME") {
    return liability ? balance - tx.amount : balance + tx.amount;
  }
  if (tx.type === "EXPENSE") {
    return liability ? balance + tx.amount : balance - tx.amount;
  }
  if (tx.type === "TRANSFER") {
    const incoming = tx.transferDirection === "IN";
    if (liability) {
      return incoming ? balance - tx.amount : balance + tx.amount;
    }
    return incoming ? balance + tx.amount : balance - tx.amount;
  }
  return balance;
}

export async function recalculateAccountBalance(
  accountId: string,
  session?: mongoose.ClientSession
) {
  const account = await Account.findById(accountId).session(session ?? null);
  if (!account) throw new Error("NOT_FOUND");

  const txs = await Transaction.find({ accountId })
    .session(session ?? null)
    .lean();

  let balance = account.initialBalance;
  const accountType = account.type as AccountType;

  for (const tx of txs) {
    balance = applyTransactionEffect(balance, tx, accountType);
  }

  if (isLiabilityAccount(accountType)) {
    balance = Math.max(0, balance);
  }

  account.currentBalance = balance;
  await account.save({ session: session ?? undefined });
  return account;
}

export function isLiabilityAccount(type: AccountType): boolean {
  return LIABILITY_TYPES.includes(type);
}

export function creditAvailable(account: {
  type: AccountType | string;
  creditLimit?: number | null;
  currentBalance?: number | null;
}): number | null {
  if (!isLiabilityAccount(account.type as AccountType)) return null;
  const limit = account.creditLimit ?? 0;
  const outstanding = Math.max(0, account.currentBalance ?? 0);
  return Math.max(0, limit - outstanding);
}

export function creditUtilizationPct(account: {
  type: AccountType | string;
  creditLimit?: number | null;
  currentBalance?: number | null;
}): number | null {
  if (!isLiabilityAccount(account.type as AccountType)) return null;
  const limit = account.creditLimit ?? 0;
  if (limit <= 0) return null;
  const outstanding = Math.max(0, account.currentBalance ?? 0);
  return Math.min(100, Math.round((outstanding / limit) * 100));
}

export async function getAccountOrThrow(
  accountId: string,
  userId: string,
  session?: mongoose.ClientSession
) {
  const account = await Account.findOne({
    _id: accountId,
    userId,
  }).session(session ?? null);
  if (!account) throw new Error("NOT_FOUND");
  return account;
}
