import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  getCashFlowForecastForUser,
  parsePeriod,
} from "@/lib/financial/phase2-service";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const period = parsePeriod(new URL(request.url).searchParams);
    const forecast = await getCashFlowForecastForUser(userId, period);
    return ok(forecast);
  } catch (error) {
    return handleError(error);
  }
}
