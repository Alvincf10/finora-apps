import { WeeklyBudget } from "@/models/WeeklyBudget";
import { Category } from "@/models/Category";
import {
  getWeekBounds,
  getWeeklyReview,
} from "@/lib/financial/weekly-review";
import {
  weekKeyFromBounds,
} from "@/lib/financial/weekly-budget";
import type { Currency } from "@/types";

export type AppliedWeeklyBudget = {
  categoryId: string;
  categoryName: string;
  weeklyAmount: number;
  currency: Currency;
  weekKey: string;
  weekLabel: string;
  reason: "advice";
};

/**
 * Set next-week category caps from weekly-report advice.
 *
 * Example: advice "Food: budget minggu depan Rp 350.000"
 * → WeeklyBudget amount = 350_000 for the Mon–Sun week AFTER the reviewed week
 *   (valid until the next weekly report).
 */
export async function applyWeeklyBudgetSuggestions(
  userId: string,
  adviceWeekOffset = 0,
  options: { onlyMissing?: boolean } = {}
): Promise<{
  applied: AppliedWeeklyBudget[];
  skipped: number;
  weekKey: string;
  weekLabel: string;
  targetOffset: number;
}> {
  const now = new Date();
  const review = await getWeeklyReview(userId, adviceWeekOffset, now);
  // "minggu depan" = week after the one in the report (relative to today offsets)
  const targetOffset = adviceWeekOffset + 1;
  const targetWeek = getWeekBounds(targetOffset, now);
  const weekKey = weekKeyFromBounds(targetWeek);
  const currency = review.currency;

  const expenseCats = await Category.find({
    userId,
    type: "EXPENSE",
    isActive: { $ne: false },
  })
    .select("_id name")
    .lean();

  const byName = new Map(
    expenseCats.map((c) => [String(c.name).toLowerCase(), c])
  );

  const existing = await WeeklyBudget.find({ userId, weekKey })
    .select("categoryId")
    .lean();
  const existingIds = new Set(existing.map((b) => b.categoryId.toString()));

  const applied: AppliedWeeklyBudget[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  for (const tip of review.advice) {
    if (tip.suggestedWeeklyAmount == null || tip.suggestedWeeklyAmount <= 0) {
      skipped += 1;
      continue;
    }

    const resolvedId =
      tip.categoryId ??
      byName.get(tip.categoryName.toLowerCase())?._id.toString() ??
      null;
    if (!resolvedId) {
      skipped += 1;
      continue;
    }
    if (seen.has(resolvedId)) continue;
    seen.add(resolvedId);

    if (options.onlyMissing && existingIds.has(resolvedId)) {
      skipped += 1;
      continue;
    }

    const weeklyAmount = Math.max(1, Math.round(tip.suggestedWeeklyAmount));
    const catName =
      byName.get(tip.categoryName.toLowerCase())?.name ?? tip.categoryName;

    await WeeklyBudget.findOneAndUpdate(
      {
        userId,
        weekKey,
        categoryId: resolvedId,
      },
      {
        $set: {
          amount: weeklyAmount,
          currency,
        },
      },
      { upsert: true, new: true }
    );

    applied.push({
      categoryId: resolvedId,
      categoryName: String(catName),
      weeklyAmount,
      currency,
      weekKey,
      weekLabel: targetWeek.label,
      reason: "advice",
    });
  }

  applied.sort((a, b) => a.categoryName.localeCompare(b.categoryName));

  return {
    applied,
    skipped,
    weekKey,
    weekLabel: targetWeek.label,
    targetOffset,
  };
}
