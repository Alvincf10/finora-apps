import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  acceptBudgetRecommendation,
  getSmartBudgetRecommendation,
  parsePeriod,
} from "@/lib/financial/phase2-service";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const period = await parsePeriod(new URL(request.url).searchParams, userId);
    const recommendation = await getSmartBudgetRecommendation(userId, period);
    return ok(recommendation);
  } catch (error) {
    return handleError(error);
  }
}

const acceptSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  currency: z.enum(["IDR", "EUR"]),
  categories: z.array(
    z.object({
      categoryId: z.string().min(1),
      amount: z.number().int().nonnegative(),
    })
  ),
});

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = acceptSchema.parse(await request.json());
    const budgets = await acceptBudgetRecommendation(
      userId,
      { year: body.year, month: body.month },
      body.categories,
      body.currency
    );
    return ok({ budgets }, 201);
  } catch (error) {
    return handleError(error);
  }
}
