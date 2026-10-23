import { addMonths, setDate, startOfDay, subDays } from "date-fns";

/**
 * If salary day falls on Sat/Sun, pay advances to the previous Friday
 * (common Indonesian payroll practice).
 */
export function adjustPaydayForWeekend(date: Date): Date {
  const d = startOfDay(date);
  const dow = d.getDay(); // 0 = Sunday, 6 = Saturday
  if (dow === 0) return subDays(d, 2);
  if (dow === 6) return subDays(d, 1);
  return d;
}

/** Actual payday date for a given calendar month (1–28 day, weekend-adjusted). */
export function resolvePaydayInMonth(
  paydayDay: number,
  year: number,
  month: number
): Date {
  const day = Math.min(28, Math.max(1, paydayDay));
  return adjustPaydayForWeekend(startOfDay(setDate(new Date(year, month, 1), day)));
}

/**
 * Next salary receipt date on/after `now` (weekend-adjusted).
 * Example: paydayDay 25, Oct 2026 (25 = Sunday) → 23 Oct.
 */
export function getNextPayday(paydayDay: number, now: Date = new Date()): Date {
  const today = startOfDay(now);
  const y = now.getFullYear();
  const m = now.getMonth();
  const thisPayday = resolvePaydayInMonth(paydayDay, y, m);

  if (today.getTime() <= thisPayday.getTime()) return thisPayday;

  const nextMonth = addMonths(new Date(y, m, 1), 1);
  return resolvePaydayInMonth(
    paydayDay,
    nextMonth.getFullYear(),
    nextMonth.getMonth()
  );
}
