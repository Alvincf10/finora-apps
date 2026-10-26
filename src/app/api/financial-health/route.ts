import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getFinancialHealth } from "@/lib/financial/metrics/financial-health";
import { parsePeriod } from "@/lib/financial/phase2-service";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const period = await parsePeriod(new URL(request.url).searchParams, userId);
    const health = await getFinancialHealth(userId, period);
    return ok(health);
  } catch (error) {
    return handleError(error);
  }
}
