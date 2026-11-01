import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { applyWeeklyBudgetSuggestions } from "@/lib/financial/budget-from-weekly";

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = await request.json().catch(() => ({}));
    const raw = Number(body?.offset ?? 0);
    const offset = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    const clamped = Math.min(0, Math.max(-52, offset));
    const onlyMissing = Boolean(body?.onlyMissing);

    const result = await applyWeeklyBudgetSuggestions(userId, clamped, {
      onlyMissing,
    });
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
