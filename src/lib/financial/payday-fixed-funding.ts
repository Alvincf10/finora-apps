/**
 * How much of this period's unpaid fixed costs are already covered by the
 * ATM Fixed (or similarly named) reserve — vs still needed from salary/cash.
 */

export type FixedReserveFunding = {
  reserve: number;
  fixedTotal: number;
  fundedAmount: number;
  shortfall: number;
  fullyFunded: boolean;
};

export function isFixedReserveAccountName(name: string | null | undefined) {
  return /fixed/i.test(name ?? "");
}

export function resolveFixedReserveFunding(
  reserve: number,
  fixedTotal: number
): FixedReserveFunding {
  const safeReserve = Math.max(0, reserve);
  const safeTotal = Math.max(0, fixedTotal);
  const fundedAmount = Math.min(safeReserve, safeTotal);
  const shortfall = Math.max(0, safeTotal - safeReserve);
  return {
    reserve: safeReserve,
    fixedTotal: safeTotal,
    fundedAmount,
    shortfall,
    fullyFunded: shortfall === 0 && safeTotal > 0,
  };
}

/** Unpaid FIXED envelope total (paid items already settled from reserve). */
export function sumUnpaidFixedAmount(
  envelopes: Array<{ kind: string; amount: number; paid?: boolean }>
): number {
  return envelopes.reduce((sum, e) => {
    if (e.kind !== "FIXED" || e.paid) return sum;
    return sum + Math.max(0, e.amount);
  }, 0);
}

/**
 * Cash allocated against salary+spendable: FIXED only counts its shortfall
 * (portion not covered by the fixed reserve).
 */
export function sumCashAllocatedWithFixedFunding(
  envelopes: Array<{ kind: string; amount: number; paid?: boolean }>,
  funding: Pick<FixedReserveFunding, "shortfall">,
  countsAgainstCash: (kind: string) => boolean
): number {
  let sum = 0;
  for (const e of envelopes) {
    if (!countsAgainstCash(e.kind)) continue;
    if (e.kind === "FIXED") continue;
    sum += Math.max(0, e.amount);
  }
  return sum + Math.max(0, funding.shortfall);
}
