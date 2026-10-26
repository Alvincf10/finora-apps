import { z } from "zod";
import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getHorizonCashFlowForecast } from "@/lib/financial/forecast/cash-flow-forecast-service";
import type { ForecastHorizonDays } from "@/lib/financial/forecast/types";

const querySchema = z.object({
  horizon: z.coerce
    .number()
    .refine((n): n is ForecastHorizonDays => n === 30 || n === 60 || n === 90, {
      message: "horizon must be 30, 60, or 90",
    })
    .default(30),
});

/**
 * GET /api/cash-flow-forecast?horizon=30|60|90
 * Read-only deterministic horizon forecast (FR-02).
 */
export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      horizon: url.searchParams.get("horizon") ?? 30,
    });
    const forecast = await getHorizonCashFlowForecast(userId, parsed.horizon);
    return ok(forecast);
  } catch (error) {
    return handleError(error);
  }
}
