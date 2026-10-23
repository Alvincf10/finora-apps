import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  getFinancialProfile,
  getSpendingAnalytics,
  parsePeriod,
} from "@/lib/financial/phase2-service";
import { getCashFlowSeries } from "@/lib/financial/summary";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const searchParams = new URL(request.url).searchParams;
    const period = await parsePeriod(searchParams, userId);
    const monthsRaw = Number(searchParams.get("months") ?? 6);
    const months = ([3, 6, 12] as const).includes(monthsRaw as 3 | 6 | 12)
      ? (monthsRaw as 3 | 6 | 12)
      : 6;

    const [profile, spending, cashFlow] = await Promise.all([
      getFinancialProfile(userId, period),
      getSpendingAnalytics(userId, period, months),
      getCashFlowSeries(userId, months),
    ]);

    return ok({
      profile,
      spending,
      cashFlow,
      period,
      months,
    });
  } catch (error) {
    return handleError(error);
  }
}
