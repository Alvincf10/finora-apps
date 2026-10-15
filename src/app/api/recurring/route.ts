import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createRecurringSchema } from "@/lib/validations";
import { RecurringTransaction } from "@/models/RecurringTransaction";
import { getAccountOrThrow } from "@/lib/financial/balances";
import {
  computeNextMonthlyOccurrence,
} from "@/lib/financial/recurring";
import { startOfDay } from "date-fns";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const items = await RecurringTransaction.find({ userId })
      .sort({ isActive: -1, nextOccurrence: 1 })
      .populate("accountId", "name currency")
      .populate("categoryId", "name type");
    return ok(items);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = createRecurringSchema.parse(await request.json());

    const account = await getAccountOrThrow(input.accountId, userId);
    if (account.currency !== input.currency) {
      throw new Error("Currency must match account currency");
    }

    let nextOccurrence: Date;
    if (input.nextOccurrence) {
      nextOccurrence = startOfDay(
        input.nextOccurrence instanceof Date
          ? input.nextOccurrence
          : new Date(input.nextOccurrence)
      );
    } else if (input.frequency === "MONTHLY" && input.dayOfMonth) {
      nextOccurrence = computeNextMonthlyOccurrence(input.dayOfMonth);
    } else {
      nextOccurrence = startOfDay(new Date());
    }

    const item = await RecurringTransaction.create({
      userId,
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      accountId: input.accountId,
      categoryId: input.categoryId,
      description: input.description,
      frequency: input.frequency,
      dayOfMonth:
        input.frequency === "MONTHLY" ? input.dayOfMonth : undefined,
      nextOccurrence,
      endDate: input.endDate
        ? startOfDay(
            input.endDate instanceof Date
              ? input.endDate
              : new Date(input.endDate)
          )
        : undefined,
      isActive: true,
    });

    const populated = await RecurringTransaction.findById(item._id)
      .populate("accountId", "name currency")
      .populate("categoryId", "name type");

    return ok(populated, 201);
  } catch (error) {
    return handleError(error);
  }
}
