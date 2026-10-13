import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createBudgetSchema } from "@/lib/validations";
import { Budget } from "@/models/Budget";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const input = createBudgetSchema.partial().parse(await request.json());
    const budget = await Budget.findOneAndUpdate(
      { _id: id, userId },
      { $set: input },
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
    const budget = await Budget.findOneAndDelete({ _id: id, userId });
    if (!budget) throw new Error("NOT_FOUND");
    return ok({ id });
  } catch (error) {
    return handleError(error);
  }
}
