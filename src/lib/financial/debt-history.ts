/** Client-safe debt history sort / month grouping. */

export type DebtHistorySortable = {
  sortAt: string;
};

export type DebtHistoryAmountable = {
  originalAmount: number;
  currency: string;
};

export type DebtHistoryMonthGroup<T extends DebtHistorySortable> = {
  /** `YYYY-MM` */
  key: string;
  label: string;
  items: T[];
};

function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Newest payment first. Missing dates sink to the bottom. */
export function sortDebtHistoryNewestFirst<T extends DebtHistorySortable>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const ta = a.sortAt ? new Date(a.sortAt).getTime() : 0;
    const tb = b.sortAt ? new Date(b.sortAt).getTime() : 0;
    return tb - ta;
  });
}

/**
 * Group sorted history into calendar months (newest month first).
 * `locale` is a BCP 47 tag (e.g. `id-ID`) for month labels.
 */
export function groupDebtHistoryByMonth<T extends DebtHistorySortable>(
  items: T[],
  locale: string = "id-ID"
): DebtHistoryMonthGroup<T>[] {
  const sorted = sortDebtHistoryNewestFirst(items);
  const groups = new Map<string, DebtHistoryMonthGroup<T>>();

  for (const item of sorted) {
    const date = item.sortAt ? new Date(item.sortAt) : new Date(0);
    const key = monthKey(date);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: date.toLocaleDateString(locale, {
          month: "long",
          year: "numeric",
        }),
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }

  return [...groups.values()];
}

/** Sum original amounts in a month group, split by currency. */
export function sumDebtHistoryMonthTotals<T extends DebtHistoryAmountable>(
  items: T[]
): Array<{ currency: string; total: number }> {
  const byCurrency = new Map<string, number>();
  for (const item of items) {
    const currency = item.currency || "IDR";
    byCurrency.set(
      currency,
      (byCurrency.get(currency) ?? 0) + (item.originalAmount ?? 0)
    );
  }
  return [...byCurrency.entries()].map(([currency, total]) => ({
    currency,
    total,
  }));
}
