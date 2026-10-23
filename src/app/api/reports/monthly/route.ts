import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  getMonthlyReview,
  parsePeriod,
} from "@/lib/financial/phase2-service";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const period = await parsePeriod(new URL(request.url).searchParams, userId);
    const review = await getMonthlyReview(userId, period);
    return ok(review);
  } catch (error) {
    return handleError(error);
  }
}
