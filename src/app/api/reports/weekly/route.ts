import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getWeeklyReview } from "@/lib/financial/weekly-review";
import { applyWeeklyBudgetSuggestions } from "@/lib/financial/budget-from-weekly";

export async function GET(request: Request) {
  try {
    const { userId } = await requireUser();
    const params = new URL(request.url).searchParams;
    const raw = Number(params.get("offset") ?? "0");
    const offset = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    // Allow looking back up to ~1 year
    const clamped = Math.min(0, Math.max(-52, offset));
    const review = await getWeeklyReview(userId, clamped);

    // Auto-create period budgets for each advice tip that isn't capped yet.
    let budgetsApplied = 0;
    try {
      const synced = await applyWeeklyBudgetSuggestions(userId, clamped, {
        onlyMissing: true,
      });
      budgetsApplied = synced.applied.length;
    } catch {
      // Budget sync is best-effort; report itself must still load.
    }

    return ok({ ...review, budgetsApplied });
  } catch (error) {
    return handleError(error);
  }
}
