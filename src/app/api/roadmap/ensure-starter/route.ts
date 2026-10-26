import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { ensureStarterCashGoal } from "@/lib/financial/wealth-ladder";
import { User } from "@/models/User";
import type { Currency } from "@/types";

/**
 * Explicit write: create/sync system BASIC_SAVINGS starter goal.
 * Evaluate/GET paths remain read-only (FR-03).
 */
export async function POST() {
  try {
    const { userId } = await requireUser();
    const user = await User.findById(userId).select("baseCurrency").lean();
    const currency = (user?.baseCurrency as Currency) ?? "IDR";
    const goal = await ensureStarterCashGoal(userId, currency);
    if (!goal) {
      return ok({
        created: false,
        reason: "Starter goal only applies for IDR base currency",
        goal: null,
      });
    }
    return ok({
      created: true,
      goal: {
        id: goal._id.toString(),
        name: goal.name,
        goalType: (goal as { goalType?: string }).goalType ?? "BASIC_SAVINGS",
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        status: goal.status,
        currency: goal.currency,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
