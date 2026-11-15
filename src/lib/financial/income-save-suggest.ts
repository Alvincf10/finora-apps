import { Category } from "@/models/Category";
import { SavingsGoal } from "@/models/SavingsGoal";
import {
  filterGoalsWithGap,
  goalGap,
  pickPriorityGoal,
  type PriorityGoalCandidate,
} from "@/lib/financial/priority-goal";
import type { Currency } from "@/types";

/** Share of non-salary income suggested toward the priority savings goal. */
export const INCOME_SAVE_SUGGEST_RATE = 0.5;

/** Income categories that get a windfall save suggestion (not Salary). */
export const INCOME_SAVE_SUGGEST_CATEGORIES = new Set([
  "Freelance",
  "Other Income",
]);

export type IncomeSaveSuggestion = {
  suggestAmount: number;
  rate: number;
  goalId: string;
  goalName: string;
  currency: Currency;
};

export type BuildIncomeSaveSuggestionInput = {
  type: "INCOME" | "EXPENSE" | "TRANSFER" | string;
  amount: number;
  currency: Currency;
  categoryName: string | null | undefined;
  goals: PriorityGoalCandidate[];
};

/**
 * Pure: suggest 50% of eligible non-salary income toward priority goal,
 * capped by remaining goal gap. Suggest-only — no side effects.
 */
export function buildIncomeSaveSuggestion(
  input: BuildIncomeSaveSuggestionInput
): IncomeSaveSuggestion | null {
  if (input.type !== "INCOME") return null;
  if (!Number.isFinite(input.amount) || input.amount <= 0) return null;

  const categoryName = (input.categoryName ?? "").trim();
  if (!INCOME_SAVE_SUGGEST_CATEGORIES.has(categoryName)) return null;

  const pocketGoals = filterGoalsWithGap(input.goals);
  const priority = pickPriorityGoal(pocketGoals);
  if (!priority) return null;

  const raw = Math.floor(input.amount * INCOME_SAVE_SUGGEST_RATE);
  const capped = Math.min(raw, goalGap(priority.goal));
  if (capped <= 0) return null;

  return {
    suggestAmount: capped,
    rate: INCOME_SAVE_SUGGEST_RATE,
    goalId: priority.goal._id.toString(),
    goalName: priority.goal.name,
    currency: input.currency,
  };
}

/** Resolve category + active goals, then build a suggest-only tip. */
export async function loadIncomeSaveSuggestion(
  userId: string,
  input: {
    type: string;
    amount: number;
    currency: Currency;
    categoryId?: string | null;
    /** When known (e.g. WA parse hint), skips a category lookup. */
    categoryName?: string | null;
  }
): Promise<IncomeSaveSuggestion | null> {
  if (input.type !== "INCOME") return null;

  let categoryName = input.categoryName?.trim() || null;
  if (!categoryName && input.categoryId) {
    const cat = await Category.findOne({
      _id: input.categoryId,
      userId,
    })
      .select({ name: 1 })
      .lean();
    categoryName = cat?.name ?? null;
  }
  if (!categoryName || !INCOME_SAVE_SUGGEST_CATEGORIES.has(categoryName)) {
    return null;
  }

  const goals = await SavingsGoal.find({ userId, status: "ACTIVE" })
    .select({ name: 1, currentAmount: 1, targetAmount: 1, goalType: 1 })
    .lean();

  return buildIncomeSaveSuggestion({
    type: "INCOME",
    amount: input.amount,
    currency: input.currency,
    categoryName,
    goals,
  });
}
