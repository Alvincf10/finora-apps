import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createWeeklyBudgetSchema } from "@/lib/validations";
import { WeeklyBudget } from "@/models/WeeklyBudget";
import {
  getWeeklyBudgetOverview,
  weekKeyFromBounds,
} from "@/lib/financial/weekly-budget";
import { getWeekBounds } from "@/lib/financial/weekly-review";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const params = new URL(request.url).searchParams;
    const raw = Number(params.get("offset") ?? "0");
    const offset = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    const clamped = Math.min(1, Math.max(-52, offset));
    const overview = await getWeeklyBudgetOverview(userId, clamped);
    return ok(overview);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = createWeeklyBudgetSchema.parse(await request.json());

    let weekKey = input.weekKey;
    if (!weekKey) {
      const offset = input.offset ?? 0;
      weekKey = weekKeyFromBounds(getWeekBounds(offset));
    }

    const budget = await WeeklyBudget.findOneAndUpdate(
      {
        userId,
        weekKey,
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
