import { ok, handleError } from "@/lib/api";
import {
  getAccountOrThrow,
  recalculateAccountBalance,
} from "@/lib/financial/balances";
import { requireUser } from "@/lib/session";
import { updateAccountSchema } from "@/lib/validations";
import { Account } from "@/models/Account";
import { Transaction } from "@/models/Transaction";

type Params = { params: Promise<{ id: string }> };

async function transactionEffects(accountId: string): Promise<number> {
  const txs = await Transaction.find({ accountId }).lean();
  let effects = 0;
  for (const tx of txs) {
    if (tx.type === "INCOME") {
      effects += tx.amount;
    } else if (tx.type === "EXPENSE") {
      effects -= tx.amount;
    } else if (tx.type === "TRANSFER") {
      effects += tx.transferDirection === "IN" ? tx.amount : -tx.amount;
    }
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

    if (desiredCurrent !== undefined) {
      const effects = await transactionEffects(id);
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
