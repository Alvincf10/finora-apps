import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createBudgetSchema } from "@/lib/validations";
import { Budget } from "@/models/Budget";
import { getBudgetOverview } from "@/lib/financial/summary";
import { parsePeriod } from "@/lib/financial/phase2-service";
import {
  getPayCycleForPeriod,
  getUserPaydayDay,
} from "@/lib/financial/pay-cycle";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const period = await parsePeriod(new URL(request.url).searchParams, userId);
    const paydayDay = await getUserPaydayDay(userId);
    const cycle = getPayCycleForPeriod(paydayDay, period);
    const items = await getBudgetOverview(userId, period);
    return ok({
      items,
      period,
      cycleLabel: cycle.label,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = createBudgetSchema.parse(await request.json());

    const budget = await Budget.findOneAndUpdate(
      {
        userId,
        year: input.year,
        month: input.month,
        categoryId: input.categoryId,
      },
      {
        $set: {
          amount: input.amount,
          currency: input.currency,
        },
      },
      { upsert: true, new: true }
    );

    return ok(budget, 201);
  } catch (error) {
    return handleError(error);
  }
}
