import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { updateTransactionSchema } from "@/lib/validations";
import { Transaction } from "@/models/Transaction";
import {
  deleteTransaction,
  updateTransaction,
} from "@/lib/financial/transactions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const tx = await Transaction.findOne({ _id: id, userId })
      .populate("accountId", "name currency")
      .populate("categoryId", "name type");
    if (!tx) throw new Error("NOT_FOUND");
    return ok(tx);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const input = updateTransactionSchema.parse(await request.json());
    const tx = await updateTransaction(userId, id, input);
    return ok(tx);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    await deleteTransaction(userId, id);
    return ok({ id });
  } catch (error) {
    return handleError(error);
  }
}
