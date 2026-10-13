import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  buildPhase2FinancialContext,
  parsePeriod,
} from "@/lib/financial/phase2-service";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const period = parsePeriod(new URL(request.url).searchParams);
    const context = await buildPhase2FinancialContext(userId, period);
    return ok(context);
  } catch (error) {
    return handleError(error);
  }
}
