import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createFixedCostSchema } from "@/lib/validations";
import { FixedCost } from "@/models/FixedCost";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const items = await FixedCost.find({ userId }).sort({ dueDay: 1, name: 1 });
    return ok(items);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = createFixedCostSchema.parse(await request.json());

    const item = await FixedCost.create({
      userId,
      name: input.name,
      amount: input.amount,
      currency: input.currency,
      dueDay: input.dueDay,
      notes: input.notes,
      isActive: true,
    });

    return ok(item, 201);
  } catch (error) {
    return handleError(error);
  }
}
