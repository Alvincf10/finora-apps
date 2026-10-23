import mongoose from "mongoose";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { updateDebtSchema } from "@/lib/validations";
import { Debt } from "@/models/Debt";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const debt = await Debt.findOne({ _id: id, userId });
    if (!debt) throw new Error("NOT_FOUND");
    return ok(debt);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const input = updateDebtSchema.parse(await request.json());
    const debt = await Debt.findOne({ _id: id, userId });
    if (!debt) throw new Error("NOT_FOUND");

    if (input.name !== undefined) debt.name = input.name;
    if (input.kind !== undefined) debt.kind = input.kind;
    if (input.interestRate !== undefined) debt.interestRate = input.interestRate;
    if (input.minimumPayment !== undefined)
      debt.minimumPayment = input.minimumPayment;
    if (input.plannedPayment !== undefined)
      debt.plannedPayment = input.plannedPayment;
    if (input.installmentMonths !== undefined)
      debt.installmentMonths = input.installmentMonths;
    if (input.dueDate !== undefined) debt.dueDate = new Date(input.dueDate);
    if (input.startDate !== undefined) debt.startDate = new Date(input.startDate);
    if (input.targetPayoffDate !== undefined)
      debt.targetPayoffDate = new Date(input.targetPayoffDate);
    if (input.notes !== undefined) debt.notes = input.notes;
    if (input.status !== undefined) debt.status = input.status;
    if (input.obligationType !== undefined)
      debt.obligationType = input.obligationType;
    if (input.linkedAccountId !== undefined) {
      debt.linkedAccountId =
        input.linkedAccountId === null
          ? undefined
          : new mongoose.Types.ObjectId(input.linkedAccountId);
    }

    // Keep paid amount when correcting original principal.
    if (input.originalAmount !== undefined) {
      const paid = Math.max(0, debt.originalAmount - debt.remainingAmount);
      debt.originalAmount = input.originalAmount;
      debt.remainingAmount = Math.max(0, input.originalAmount - paid);
      if (debt.remainingAmount === 0 && debt.status === "ACTIVE") {
        debt.status = "PAID";
      } else if (debt.remainingAmount > 0 && debt.status === "PAID") {
        debt.status = "ACTIVE";
      }
    }

    await debt.save();
    return ok(debt);
  } catch (error) {
    return handleError(error);
  }
}
