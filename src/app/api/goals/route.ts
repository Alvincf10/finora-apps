import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createGoalSchema } from "@/lib/validations";
import { SavingsGoal } from "@/models/SavingsGoal";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const goals = await SavingsGoal.find({ userId }).sort({ priority: -1 });
    return ok(goals);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = createGoalSchema.parse(await request.json());

    const goal = await SavingsGoal.create({
      userId,
      name: input.name,
      targetAmount: input.targetAmount,
      currentAmount: input.currentAmount ?? 0,
      currency: input.currency,
      targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
      priority: input.priority ?? 0,
      notes: input.notes,
      status: "ACTIVE",
    });

    return ok(goal, 201);
  } catch (error) {
    return handleError(error);
  }
}
