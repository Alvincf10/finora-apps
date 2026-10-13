import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getFinancialSummary } from "@/lib/financial/summary";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getFullYear());
    const month = Number(searchParams.get("month") ?? now.getMonth() + 1);
    const summary = await getFinancialSummary(userId, { year, month });
    return ok(summary);
  } catch (error) {
    return handleError(error);
  }
}
