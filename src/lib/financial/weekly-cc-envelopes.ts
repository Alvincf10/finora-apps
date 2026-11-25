/**
 * Weekly lifestyle envelopes funded by remaining CC headroom
 * (debitMode cards). Cash/debit/QRIS is backup only — not the burn pool.
 */

export const CC_WEEKLY_ENVELOPE_NAMES = [
  "Food",
  "Entertainment",
  "Relationship",
] as const;

export type CcWeeklyEnvelopeName = (typeof CC_WEEKLY_ENVELOPE_NAMES)[number];

export const DEFAULT_CC_ENVELOPE_SHARES: Record<CcWeeklyEnvelopeName, number> = {
  Food: 0.55,
  Entertainment: 0.25,
  Relationship: 0.2,
};

/** Inclusive calendar weeks from `from` through `cycleEnd` (min 1). */
export function remainingCalendarWeeks(from: Date, cycleEnd: Date): number {
  const startMs = from.getTime();
  const endMs = cycleEnd.getTime();
  if (endMs < startMs) return 1;
  const days = Math.max(1, Math.ceil((endMs - startMs) / 86_400_000));
  return Math.max(1, Math.ceil(days / 7));
}

export function sharesFromWeekAmounts(
  amounts: Partial<Record<CcWeeklyEnvelopeName, number>>
): Record<CcWeeklyEnvelopeName, number> {
  const positives = CC_WEEKLY_ENVELOPE_NAMES.map((name) =>
    Math.max(0, amounts[name] ?? 0)
  );
  const sum = positives.reduce((s, v) => s + v, 0);
  if (sum <= 0) {
    return { ...DEFAULT_CC_ENVELOPE_SHARES };
  }
  return {
    Food: positives[0]! / sum,
    Entertainment: positives[1]! / sum,
    Relationship: positives[2]! / sum,
  };
}

function roundSoft(amount: number, weeklyPool: number): number {
  if (amount <= 0) return 0;
  // Soft round only when the pool is large enough that buckets stay meaningful.
  if (weeklyPool >= 500_000) {
    return Math.round(amount / 25_000) * 25_000;
  }
  if (weeklyPool >= 100_000) {
    return Math.round(amount / 5_000) * 5_000;
  }
  return Math.round(amount);
}

/**
 * Split remaining CC headroom across weeks left in the pay cycle, then into
 * Food / Entertainment / Relationship by recent spend mix (or defaults).
 */
export function allocateWeeklyEnvelopesFromCc(input: {
  ccHeadroom: number;
  remainingWeeks: number;
  recentWeekAmounts?: Partial<Record<CcWeeklyEnvelopeName, number>>;
}): {
  weeklyPool: number;
  amounts: Record<CcWeeklyEnvelopeName, number>;
  shares: Record<CcWeeklyEnvelopeName, number>;
} {
  const weeks = Math.max(1, Math.floor(input.remainingWeeks));
  const headroom = Math.max(0, Math.round(input.ccHeadroom));
  const weeklyPool = Math.floor(headroom / weeks);
  const shares = sharesFromWeekAmounts(input.recentWeekAmounts ?? {});

  if (weeklyPool <= 0) {
    return {
      weeklyPool: 0,
      amounts: { Food: 0, Entertainment: 0, Relationship: 0 },
      shares,
    };
  }

  const raw = CC_WEEKLY_ENVELOPE_NAMES.map((name) => ({
    name,
    value: weeklyPool * shares[name],
  }));

  // Largest-remainder so category amounts sum exactly to weeklyPool before soft round.
  const floored = raw.map((r) => ({
    name: r.name,
    base: Math.floor(r.value),
    frac: r.value - Math.floor(r.value),
  }));
  let leftover = weeklyPool - floored.reduce((s, r) => s + r.base, 0);
  floored
    .slice()
    .sort((a, b) => b.frac - a.frac)
    .forEach((row) => {
      if (leftover <= 0) return;
      row.base += 1;
      leftover -= 1;
    });

  const soft = floored.map((r) => ({
    name: r.name,
    amount: roundSoft(r.base, weeklyPool),
  }));

  // Soft round can drift — rebalance so sum ≤ weeklyPool (never invent extra).
  let softSum = soft.reduce((s, r) => s + r.amount, 0);
  if (softSum > weeklyPool) {
    const overflow = softSum - weeklyPool;
    // Trim from largest non-Food first, then Food.
    const order: CcWeeklyEnvelopeName[] = [
      "Entertainment",
      "Relationship",
      "Food",
    ];
    let left = overflow;
    for (const name of order) {
      if (left <= 0) break;
      const row = soft.find((r) => r.name === name)!;
      const cut = Math.min(row.amount, left);
      row.amount -= cut;
      left -= cut;
    }
    softSum = soft.reduce((s, r) => s + r.amount, 0);
  }

  // Any unused remainder after soft round goes to Food (kebutuhan wajib).
  if (softSum < weeklyPool) {
    const food = soft.find((r) => r.name === "Food")!;
    food.amount += weeklyPool - softSum;
  }

  const amounts = {
    Food: 0,
    Entertainment: 0,
    Relationship: 0,
  } as Record<CcWeeklyEnvelopeName, number>;
  for (const row of soft) {
    amounts[row.name] = Math.max(0, row.amount);
  }

  return { weeklyPool, amounts, shares };
}

export function sumDebitModeCcHeadroom(
  cards: Array<{ debitMode: boolean; available: number }>
): { hasDebitMode: boolean; ccHeadroom: number } {
  const debitMode = cards.filter((c) => c.debitMode);
  return {
    hasDebitMode: debitMode.length > 0,
    ccHeadroom: debitMode.reduce((s, c) => s + Math.max(0, c.available), 0),
  };
}
