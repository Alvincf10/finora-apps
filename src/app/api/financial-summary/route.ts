import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getFinancialSummary } from "@/lib/financial/summary";
import { parsePeriod } from "@/lib/financial/phase2-service";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const period = await parsePeriod(new URL(request.url).searchParams, userId);
    const summary = await getFinancialSummary(userId, period);
    return ok(summary);
  } catch (error) {
    return handleError(error);
  }
}
