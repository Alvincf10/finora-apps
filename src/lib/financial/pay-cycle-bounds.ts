import {
  addMonths,
  endOfDay,
  startOfDay,
  subDays,
} from "date-fns";
import { resolvePaydayInMonth } from "@/lib/financial/payday";

/** Client-safe pay-cycle date helpers (no DB / mongoose imports). */

export type PayCycleBounds = {
  start: Date;
  end: Date;
  paydayDay: number;
  label: string;
};

export type PeriodRef = { year: number; month: number };

function cycleLabel(start: Date, end: Date) {
  return `${start.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  })} – ${end.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

/**
 * Pay cycle that contains `now`: payday → day before next payday.
 *
 * Weekend rule: if nominal payday falls Sat/Sun → previous Friday.
 */
export function getPayCycleBounds(
  paydayDay: number,
  now: Date = new Date()
): PayCycleBounds {
  const day = Math.min(28, Math.max(1, paydayDay));
  const today = startOfDay(now);
  const y = now.getFullYear();
  const m = now.getMonth();

  const thisMonthPayday = resolvePaydayInMonth(day, y, m);

  let cycleStart: Date;
  let nextPayday: Date;

  if (today.getTime() >= thisMonthPayday.getTime()) {
    cycleStart = thisMonthPayday;
    const nextMonth = addMonths(new Date(y, m, 1), 1);
    nextPayday = resolvePaydayInMonth(
      day,
      nextMonth.getFullYear(),
      nextMonth.getMonth()
    );
  } else {
    const prevMonth = addMonths(new Date(y, m, 1), -1);
    cycleStart = resolvePaydayInMonth(
      day,
      prevMonth.getFullYear(),
      prevMonth.getMonth()
    );
    nextPayday = thisMonthPayday;
  }

  const cycleEnd = endOfDay(subDays(nextPayday, 1));

  return {
    start: cycleStart,
    end: cycleEnd,
    paydayDay: day,
    label: cycleLabel(cycleStart, cycleEnd),
  };
}

/**
 * Pay cycle for the payday that falls in `period`'s calendar month.
 * e.g. {2026,10} + paydayDay 25 → 23 Okt – 24 Nov 2026 (weekend-adjusted).
 */
export function getPayCycleForPeriod(
  paydayDay: number,
  period: PeriodRef
): PayCycleBounds {
  const day = Math.min(28, Math.max(1, paydayDay));
  const y = period.year;
  const m = period.month - 1; // 0-indexed
  const cycleStart = resolvePaydayInMonth(day, y, m);
  const nextMonth = addMonths(new Date(y, m, 1), 1);
  const nextPayday = resolvePaydayInMonth(
    day,
    nextMonth.getFullYear(),
    nextMonth.getMonth()
  );
  const cycleEnd = endOfDay(subDays(nextPayday, 1));
  return {
    start: cycleStart,
    end: cycleEnd,
    paydayDay: day,
    label: cycleLabel(cycleStart, cycleEnd),
  };
}

/** Period key = calendar month of the cycle's payday (start). */
export function periodFromDate(
  paydayDay: number,
  now: Date = new Date()
): PeriodRef {
  const cycle = getPayCycleBounds(paydayDay, now);
  return {
    year: cycle.start.getFullYear(),
    month: cycle.start.getMonth() + 1,
  };
}

export function shiftPeriodRef(
  period: PeriodRef,
  monthsBack: number
): PeriodRef {
  const d = addMonths(new Date(period.year, period.month - 1, 1), -monthsBack);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Days elapsed / total in a cycle (for projections). */
export function getCycleProgress(
  cycle: PayCycleBounds,
  now: Date = new Date()
): { elapsedDays: number; totalDays: number; isCurrent: boolean } {
  const startMs = cycle.start.getTime();
  const endMs = cycle.end.getTime();
  const nowMs = now.getTime();
  const totalMs = Math.max(1, endMs - startMs);
  const totalDays = Math.max(1, Math.ceil(totalMs / 86_400_000));
  const isCurrent = nowMs >= startMs && nowMs <= endMs;
  if (!isCurrent) {
    return { elapsedDays: totalDays, totalDays, isCurrent: false };
  }
  const elapsedDays = Math.max(
    1,
    Math.min(totalDays, Math.ceil((nowMs - startMs) / 86_400_000))
  );
  return { elapsedDays, totalDays, isCurrent: true };
}

/** Local `YYYY-MM-DD` for `<input type="date">` / API from·to params. */
export function toDateInputValue(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
