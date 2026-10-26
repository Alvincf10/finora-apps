import {
  startOfDay,
  endOfDay,
  getDaysInMonth,
  isWithinInterval,
} from "date-fns";
import { FixedCost } from "@/models/FixedCost";
import type { Currency } from "@/types";

export type FixedCostDueItem = {
  fixedCostId: string;
  name: string;
  amount: number;
  currency: Currency;
  dueDay: number;
  dueDate: string;
};

/** Due day 30/31 → last day of shorter months (e.g. Feb). */
function dateOnDueDay(year: number, monthIndex: number, dueDay: number): Date {
  const day = Math.min(31, Math.max(1, dueDay));
  const dim = getDaysInMonth(new Date(year, monthIndex, 1));
  return startOfDay(new Date(year, monthIndex, Math.min(day, dim)));
}

/**
 * Resolve the occurrence of a monthly dueDay inside [start, end].
 * Example cycle 25 Okt–24 Nov, dueDay 10 → 10 Nov; dueDay 30 → 30 Okt or 30 Nov if in range.
 */
export function occurrenceInRange(
  dueDay: number,
  start: Date,
  end: Date
): Date | null {
  const all = allOccurrencesInRange(dueDay, start, end);
  return all[0] ?? null;
}

/**
 * All monthly due-day occurrences inside [start, end] (inclusive).
 * Used by 30/60/90-day cash-flow forecast horizons.
 */
export function allOccurrencesInRange(
  dueDay: number,
  start: Date,
  end: Date
): Date[] {
  const rangeStart = startOfDay(start);
  const rangeEnd = endOfDay(end);
  const results: Date[] = [];

  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const lastMonth = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);

  while (cursor <= lastMonth) {
    const d = dateOnDueDay(cursor.getFullYear(), cursor.getMonth(), dueDay);
    if (isWithinInterval(d, { start: rangeStart, end: rangeEnd })) {
      results.push(d);
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return results;
}

export async function getFixedCostsInRange(
  userId: string,
  start: Date,
  end: Date,
  preferredCurrency: Currency = "IDR"
): Promise<{
  items: FixedCostDueItem[];
  total: number;
  currency: Currency;
}> {
  const costs = await FixedCost.find({ userId, isActive: true }).lean();
  const items: FixedCostDueItem[] = [];

  for (const cost of costs) {
    const dueDate = occurrenceInRange(cost.dueDay, start, end);
    if (!dueDate) continue;
    if (cost.currency !== preferredCurrency) {
      // Phase 1: only sum matching base currency; still list item
    }
    items.push({
      fixedCostId: cost._id.toString(),
      name: cost.name,
      amount: cost.amount,
      currency: cost.currency as Currency,
      dueDay: cost.dueDay,
      dueDate: dueDate.toISOString(),
    });
  }

  items.sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  const total = items
    .filter((i) => i.currency === preferredCurrency)
    .reduce((sum, i) => sum + i.amount, 0);

  return {
    items,
    total,
    currency: preferredCurrency,
  };
}
