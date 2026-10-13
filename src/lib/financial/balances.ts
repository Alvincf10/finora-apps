import mongoose from "mongoose";
import { Account } from "@/models/Account";
import { Transaction } from "@/models/Transaction";
import type { AccountType } from "@/types";

const LIABILITY_TYPES: AccountType[] = ["CREDIT_CARD"];

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

  for (const tx of txs) {
    if (tx.type === "INCOME") {
      balance += tx.amount;
    } else if (tx.type === "EXPENSE") {
      balance -= tx.amount;
    } else if (tx.type === "TRANSFER") {
      if (tx.transferDirection === "IN") {
        balance += tx.amount;
      } else {
        balance -= tx.amount;
      }
    }
  }

  account.currentBalance = balance;
  await account.save({ session: session ?? undefined });
  return account;
}

export function isLiabilityAccount(type: AccountType): boolean {
  return LIABILITY_TYPES.includes(type);
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
