import { ok, handleError } from "@/lib/api";
import {
  applyTransactionEffect,
  getAccountOrThrow,
  recalculateAccountBalance,
} from "@/lib/financial/balances";
import { requireUser } from "@/lib/session";
import { updateAccountSchema } from "@/lib/validations";
import { Account } from "@/models/Account";
import { Transaction } from "@/models/Transaction";
import type { AccountType } from "@/types";

type Params = { params: Promise<{ id: string }> };

async function transactionEffects(
  accountId: string,
  accountType: AccountType
): Promise<number> {
  const txs = await Transaction.find({ accountId }).lean();
  let effects = 0;
  for (const tx of txs) {
    const next = applyTransactionEffect(0, tx, accountType);
    // applyTransactionEffect from 0 gives signed delta for this tx
    effects += next;
  }
  return effects;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const account = await Account.findOne({ _id: id, userId });
    if (!account) throw new Error("NOT_FOUND");
    return ok(account);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const input = updateAccountSchema.parse(await request.json());
    const account = await getAccountOrThrow(id, userId);

    const { currentBalance: desiredCurrent, ...fields } = input;
    if (fields.name !== undefined) account.name = fields.name;
    if (fields.type !== undefined) account.type = fields.type;
    if (fields.isActive !== undefined) account.isActive = fields.isActive;

    if (fields.creditLimit !== undefined) {
      account.creditLimit = fields.creditLimit ?? undefined;
    }
    if (fields.statementDueAmount !== undefined) {
      account.statementDueAmount = fields.statementDueAmount ?? undefined;
    }
    if (fields.statementDueDay !== undefined) {
      account.statementDueDay = fields.statementDueDay ?? undefined;
    }
    if (fields.debitMode !== undefined) {
      account.debitMode = fields.debitMode;
    }

    const accountType = account.type as AccountType;

    if (desiredCurrent !== undefined) {
      const effects = await transactionEffects(id, accountType);
      account.initialBalance = desiredCurrent - effects;
    } else if (fields.initialBalance !== undefined) {
      account.initialBalance = fields.initialBalance;
    }

    await account.save();

    if (desiredCurrent !== undefined || fields.initialBalance !== undefined) {
      const refreshed = await recalculateAccountBalance(id);
      return ok(refreshed);
    }

    return ok(account);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const account = await Account.findOneAndUpdate(
      { _id: id, userId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!account) throw new Error("NOT_FOUND");
    return ok(account);
  } catch (error) {
    return handleError(error);
  }
}
