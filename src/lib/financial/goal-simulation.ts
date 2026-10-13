import { differenceInCalendarDays, addDays } from "date-fns";

export type GoalDailySimulation = {
  remaining: number;
  dailyAmount: number;
  daysNeeded: number;
  weeksNeeded: number;
  monthsNeeded: number;
  reachDate: string | null;
};

export type GoalIdealSavings = {
  remaining: number;
  hasTargetDate: boolean;
  isOverdue: boolean;
  daysLeft: number | null;
  idealDaily: number | null;
  idealWeekly: number | null;
  idealMonthly: number | null;
  /** Suggested paces if no (or alongside) target date */
  horizons: Array<{
    label: string;
    months: number;
    daily: number;
    weekly: number;
    monthly: number;
  }>;
};

export function simulateDailySavings(
  targetAmount: number,
  currentAmount: number,
  dailyAmount: number,
  fromDate: Date = new Date()
): GoalDailySimulation {
  const remaining = Math.max(0, targetAmount - currentAmount);
  if (remaining <= 0 || dailyAmount <= 0) {
    return {
      remaining,
      dailyAmount,
      daysNeeded: 0,
      weeksNeeded: 0,
      monthsNeeded: 0,
      reachDate: remaining <= 0 ? fromDate.toISOString() : null,
    };
  }

  const daysNeeded = Math.ceil(remaining / dailyAmount);
  return {
    remaining,
    dailyAmount,
    daysNeeded,
    weeksNeeded: Math.ceil(daysNeeded / 7),
    monthsNeeded: Math.ceil(daysNeeded / 30),
    reachDate: addDays(fromDate, daysNeeded).toISOString(),
  };
}

export function idealSavingsToTarget(
  targetAmount: number,
  currentAmount: number,
  targetDate?: Date | string | null,
  fromDate: Date = new Date()
): GoalIdealSavings {
  const remaining = Math.max(0, targetAmount - currentAmount);
  const horizons = [3, 6, 12].map((months) => {
    const days = months * 30;
    const daily = remaining <= 0 ? 0 : Math.ceil(remaining / days);
    return {
      label: `${months} months`,
      months,
      daily,
      weekly: daily * 7,
      monthly: remaining <= 0 ? 0 : Math.ceil(remaining / months),
    };
  });

  if (!targetDate || remaining <= 0) {
    return {
      remaining,
      hasTargetDate: Boolean(targetDate),
      isOverdue: false,
      daysLeft: null,
      idealDaily: null,
      idealWeekly: null,
      idealMonthly: null,
      horizons,
    };
  }

  const target = new Date(targetDate);
  const rawDaysLeft = differenceInCalendarDays(target, fromDate);
  if (rawDaysLeft <= 0) {
    return {
      remaining,
      hasTargetDate: true,
      isOverdue: true,
      daysLeft: 0,
      idealDaily: null,
      idealWeekly: null,
      idealMonthly: null,
      horizons,
    };
  }

  const daysLeft = rawDaysLeft;
  const monthsLeft = Math.max(1, daysLeft / 30);
  const idealDaily = Math.ceil(remaining / daysLeft);

  return {
    remaining,
    hasTargetDate: true,
    isOverdue: false,
    daysLeft,
    idealDaily,
    idealWeekly: idealDaily * 7,
    idealMonthly: Math.ceil(remaining / monthsLeft),
    horizons,
  };
}
