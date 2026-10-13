import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createBudgetSchema } from "@/lib/validations";
import { Budget } from "@/models/Budget";
import { getBudgetOverview } from "@/lib/financial/summary";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getFullYear());
    const month = Number(searchParams.get("month") ?? now.getMonth() + 1);
    const overview = await getBudgetOverview(userId, { year, month });
    return ok(overview);
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
