import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createWeeklyBudgetSchema } from "@/lib/validations";
import { WeeklyBudget } from "@/models/WeeklyBudget";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const input = createWeeklyBudgetSchema
      .partial()
      .parse(await request.json());
    const { offset: _offset, ...patch } = input;
    const budget = await WeeklyBudget.findOneAndUpdate(
      { _id: id, userId },
      { $set: patch },
      { new: true }
    );
    if (!budget) throw new Error("NOT_FOUND");
    return ok(budget);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const budget = await WeeklyBudget.findOneAndDelete({ _id: id, userId });
    if (!budget) throw new Error("NOT_FOUND");
    return ok({ id });
  } catch (error) {
    return handleError(error);
  }
}
