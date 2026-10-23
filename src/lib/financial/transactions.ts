import mongoose from "mongoose";
import { Transaction } from "@/models/Transaction";
import { getAccountOrThrow, recalculateAccountBalance } from "@/lib/financial/balances";
import { sessionOption, withTransaction } from "@/lib/with-transaction";
import type { createTransactionSchema } from "@/lib/validations";
import type { z } from "zod";

type CreateInput = z.infer<typeof createTransactionSchema>;

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export async function createTransaction(userId: string, input: CreateInput) {
  const date = toDate(input.date);

  if (input.type === "TRANSFER") {
    return createTransfer(userId, input, date);
  }

  const account = await getAccountOrThrow(input.accountId, userId);
  if (account.currency !== input.currency) {
    throw new Error("Transaction currency must match account currency");
  }

  const tx = await Transaction.create({
    userId,
    accountId: input.accountId,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    categoryId: input.categoryId,
    description: input.description,
    date,
    notes: input.notes,
    merchant: input.merchant,
    tags: input.tags,
  });

  await recalculateAccountBalance(input.accountId);
  return tx;
}

async function createTransfer(
  userId: string,
  input: CreateInput,
  date: Date
) {
  if (!input.toAccountId) throw new Error("toAccountId is required");
  if (input.accountId === input.toAccountId) {
    throw new Error("Cannot transfer to the same account");
  }

  const from = await getAccountOrThrow(input.accountId, userId);
  const to = await getAccountOrThrow(input.toAccountId, userId);

  if (from.currency !== to.currency) {
    throw new Error("Cross-currency transfers are not supported in Phase 1");
  }
  if (from.currency !== input.currency) {
    throw new Error("Transaction currency must match account currency");
  }

  const transferId = new mongoose.Types.ObjectId();

  return withTransaction(async (session) => {
    const [outTx] = await Transaction.create(
      [
        {
          userId,
          accountId: from._id,
          type: "TRANSFER",
          amount: input.amount,
          currency: input.currency,
          description: input.description ?? `Transfer to ${to.name}`,
          date,
          notes: input.notes,
          transferId,
          transferDirection: "OUT",
          counterpartyAccountId: to._id,
        },
      ],
      sessionOption(session)
    );

    await Transaction.create(
      [
        {
          userId,
          accountId: to._id,
          type: "TRANSFER",
          amount: input.amount,
          currency: input.currency,
          description: input.description ?? `Transfer from ${from.name}`,
          date,
          notes: input.notes,
          transferId,
          transferDirection: "IN",
          counterpartyAccountId: from._id,
        },
      ],
      sessionOption(session)
    );

    await recalculateAccountBalance(from._id.toString(), session ?? undefined);
    await recalculateAccountBalance(to._id.toString(), session ?? undefined);
    return outTx;
  });
}

export async function deleteTransaction(userId: string, transactionId: string) {
  const tx = await Transaction.findOne({ _id: transactionId, userId });
  if (!tx) throw new Error("NOT_FOUND");

  const accountIds = new Set<string>([tx.accountId.toString()]);
  const transferId = tx.transferId;

  // Use Model.delete* (not doc.deleteOne): if a multi-doc transaction aborts and
  // withTransaction retries without a session, mongoose may skip a second
  // doc.deleteOne because $isDeleted was already set from the rolled-back attempt.
  await withTransaction(async (session) => {
    if (transferId) {
      const paired = await Transaction.find({
        transferId,
        userId,
      }).session(session);

      for (const p of paired) {
        accountIds.add(p.accountId.toString());
      }

      const res = await Transaction.deleteMany(
        { transferId, userId },
        sessionOption(session)
      );
      if (!res.deletedCount) throw new Error("NOT_FOUND");
    } else {
      const res = await Transaction.deleteOne(
        { _id: tx._id, userId },
        sessionOption(session)
      );
      if (!res.deletedCount) throw new Error("NOT_FOUND");
    }

    for (const accountId of accountIds) {
      await recalculateAccountBalance(accountId, session ?? undefined);
    }
  });
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: {
    amount?: number;
    categoryId?: string;
    description?: string;
    date?: string | Date;
    notes?: string;
    merchant?: string;
    tags?: string[];
  }
) {
  const tx = await Transaction.findOne({ _id: transactionId, userId });
  if (!tx) throw new Error("NOT_FOUND");
  if (tx.type === "TRANSFER") {
    throw new Error("Edit transfer by deleting and recreating");
  }

  if (input.amount !== undefined) tx.amount = input.amount;
  if (input.categoryId !== undefined) tx.categoryId = input.categoryId as never;
  if (input.description !== undefined) tx.description = input.description;
  if (input.date !== undefined) tx.date = toDate(input.date);
  if (input.notes !== undefined) tx.notes = input.notes;
  if (input.merchant !== undefined) tx.merchant = input.merchant;
  if (input.tags !== undefined) tx.tags = input.tags;

  await tx.save();
  await recalculateAccountBalance(tx.accountId.toString());
  return tx;
}
