import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  getFinancialProfile,
  getSpendingAnalytics,
  parsePeriod,
} from "@/lib/financial/phase2-service";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const period = parsePeriod(new URL(request.url).searchParams);
    const [profile, spending] = await Promise.all([
      getFinancialProfile(userId, period),
      getSpendingAnalytics(userId, period),
    ]);
    return ok({ profile, spending, period });
  } catch (error) {
    return handleError(error);
  }
}
