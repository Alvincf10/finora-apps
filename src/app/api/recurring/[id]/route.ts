import { startOfDay } from "date-fns";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { updateRecurringSchema } from "@/lib/validations";
import { RecurringTransaction } from "@/models/RecurringTransaction";
import { getAccountOrThrow } from "@/lib/financial/balances";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const input = updateRecurringSchema.parse(await request.json());
    const item = await RecurringTransaction.findOne({ _id: id, userId });
    if (!item) throw new Error("NOT_FOUND");

    if (input.accountId !== undefined || input.currency !== undefined) {
      const accountId = input.accountId ?? item.accountId.toString();
      const currency = input.currency ?? item.currency;
      const account = await getAccountOrThrow(accountId, userId);
      if (account.currency !== currency) {
        throw new Error("Currency must match account currency");
      }
    }

    if (input.type !== undefined) item.type = input.type;
    if (input.amount !== undefined) item.amount = input.amount;
    if (input.currency !== undefined) item.currency = input.currency;
    if (input.accountId !== undefined) item.accountId = input.accountId as never;
    if (input.categoryId !== undefined)
      item.categoryId = input.categoryId as never;
    if (input.description !== undefined)
      item.description = input.description ?? undefined;
    if (input.frequency !== undefined) item.frequency = input.frequency;
    if (input.dayOfMonth !== undefined)
      item.dayOfMonth = input.dayOfMonth ?? undefined;
    if (input.nextOccurrence !== undefined) {
      item.nextOccurrence = startOfDay(
        input.nextOccurrence instanceof Date
          ? input.nextOccurrence
          : new Date(input.nextOccurrence)
      );
    }
    if (input.endDate !== undefined) {
      item.endDate = input.endDate
        ? startOfDay(
            input.endDate instanceof Date
              ? input.endDate
              : new Date(input.endDate)
          )
        : undefined;
    }
    if (input.isActive !== undefined) item.isActive = input.isActive;

    await item.save();

    const populated = await RecurringTransaction.findById(item._id)
      .populate("accountId", "name currency")
      .populate("categoryId", "name type");

    return ok(populated);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const item = await RecurringTransaction.findOneAndDelete({
      _id: id,
      userId,
    });
    if (!item) throw new Error("NOT_FOUND");
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
