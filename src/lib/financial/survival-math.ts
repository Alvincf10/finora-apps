/** Keep at least this many days of runway before suggesting goal contributions. */
export const SURVIVAL_SAFE_RESERVE_DAYS = 3;

export function computeSurvivalFromCash(
  cashOnHand: number,
  daysLeft: number,
  safeReserveDays = SURVIVAL_SAFE_RESERVE_DAYS
): {
  dailyBudget: number;
  maxSafeGoalContribution: number;
} {
  if (daysLeft <= 0 || cashOnHand <= 0) {
    return { dailyBudget: 0, maxSafeGoalContribution: 0 };
  }

  const dailyBudget = Math.floor(cashOnHand / daysLeft);

  if (daysLeft <= safeReserveDays) {
    return { dailyBudget, maxSafeGoalContribution: 0 };
  }

  const reserve = dailyBudget * safeReserveDays;
  const maxSafeGoalContribution = Math.max(0, cashOnHand - reserve);

  return { dailyBudget, maxSafeGoalContribution };
}

/** What-if after setting aside money for goals. */
export function applyGoalAllocation(
  cashOnHand: number,
  daysLeft: number,
  goalAllocation: number,
  maxSafeGoalContribution: number
): {
  livingCash: number;
  dailyBudget: number;
  goalAllocation: number;
  withinSafeLimit: boolean;
  tight: boolean;
} {
  const capped = Math.max(0, Math.min(goalAllocation, cashOnHand));
  const livingCash = Math.max(0, cashOnHand - capped);
  const dailyBudget =
    daysLeft > 0 ? Math.floor(livingCash / daysLeft) : livingCash;
  const baseDaily =
    daysLeft > 0 ? Math.floor(cashOnHand / daysLeft) : cashOnHand;

  return {
    livingCash,
    dailyBudget,
    goalAllocation: capped,
    withinSafeLimit: capped <= maxSafeGoalContribution,
    tight: daysLeft > 0 && dailyBudget < baseDaily * 0.7,
  };
}
