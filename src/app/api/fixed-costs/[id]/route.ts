import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { updateFixedCostSchema } from "@/lib/validations";
import { FixedCost } from "@/models/FixedCost";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const input = updateFixedCostSchema.parse(await request.json());
    const item = await FixedCost.findOne({ _id: id, userId });
    if (!item) throw new Error("NOT_FOUND");

    if (input.name !== undefined) item.name = input.name;
    if (input.amount !== undefined) item.amount = input.amount;
    if (input.currency !== undefined) item.currency = input.currency;
    if (input.dueDay !== undefined) item.dueDay = input.dueDay;
    if (input.notes !== undefined) item.notes = input.notes;
    if (input.isActive !== undefined) item.isActive = input.isActive;

    await item.save();
    return ok(item);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const item = await FixedCost.findOneAndDelete({ _id: id, userId });
    if (!item) throw new Error("NOT_FOUND");
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
