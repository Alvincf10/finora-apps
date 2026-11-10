/**
 * Pure payday leftover split (after debts / CC statement / fixed).
 * Cash envelopes consume bank+salary leftover; CC_SPEND_CAP is planning-only
 * (card headroom) and must not reduce cash remaining.
 */

export type LeftoverEnvelopeKind =
  | "CASH_BUFFER"
  | "CC_SPEND_CAP"
  | "LIVING"
  | "GOALS"
  | "OTHER";

export type LeftoverEnvelope = {
  key: string;
  label: string;
  amount: number;
  source: "AUTO" | "MANUAL";
  kind: LeftoverEnvelopeKind;
};

export type PriorityGoalInput = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
} | null;

/** Envelope kinds that spend real cash (salary + bank/cash accounts). */
export function countsAgainstCashTotal(kind: string): boolean {
  return kind !== "CC_SPEND_CAP";
}

export function sumCashAllocated(
  envelopes: Array<{ kind: string; amount: number }>
): number {
  return envelopes.reduce(
    (sum, e) => sum + (countsAgainstCashTotal(e.kind) ? e.amount : 0),
    0
  );
}

function roundMoney(n: number) {
  return Math.max(0, Math.round(n));
}

/**
 * Suggest physical wallet float for small non-QRIS shops.
 * Keep it small — daily spend lives on debit/QRIS + CC limit.
 */
export function suggestPhysicalWallet(
  leftoverAfterGoals: number,
  currency: string
): number {
  if (leftoverAfterGoals <= 0) return 0;

  if (currency === "IDR") {
    // ~5% after goals, floor 100k when possible, hard cap 500k.
    let target = roundMoney(leftoverAfterGoals * 0.05);
    if (leftoverAfterGoals >= 100_000) {
      target = Math.max(target, 100_000);
    }
    target = Math.min(target, 500_000);
    return Math.min(leftoverAfterGoals, target);
  }

  // Other currencies: ~5%, no hard floor/cap in minor units.
  return Math.min(leftoverAfterGoals, roundMoney(leftoverAfterGoals * 0.05));
}

/**
 * Split spendable cash left after obligated envelopes.
 * `leftoverCash` must already exclude manual leftover amounts (those are prepended).
 * Order: goals → physical wallet → debit/QRIS living. CC cap is appended separately
 * and does not consume leftoverCash.
 */
export function buildPaydayLeftoverEnvelopes(input: {
  leftoverCash: number;
  currency: string;
  priorityGoal: PriorityGoalInput;
  /** Available credit on debitMode cards (planning cap, not cash). */
  ccSpendCap: number;
  manualLeftovers?: LeftoverEnvelope[];
}): LeftoverEnvelope[] {
  const manual = input.manualLeftovers ?? [];
  let leftover = Math.max(0, input.leftoverCash);

  const priorityGoal = input.priorityGoal;
  const priorityGap = priorityGoal
    ? Math.max(
        0,
        (priorityGoal.targetAmount ?? 0) - (priorityGoal.currentAmount ?? 0)
      )
    : 0;

  // Goals first: ~25% of clean spendable (toward the Insights-priority pocket).
  const goalsTarget = priorityGoal
    ? roundMoney(
        Math.min(
          leftover * 0.25,
          priorityGap > 0 ? priorityGap : leftover * 0.25
        )
      )
    : 0;
  leftover -= goalsTarget;

  // Physical wallet next — small float for non-QRIS shops.
  const bufferTarget = suggestPhysicalWallet(leftover, input.currency);
  leftover -= bufferTarget;

  // Rest = belanja debit / QRIS (not physical cash).
  const living = Math.max(0, leftover);

  const goalsLabel = priorityGoal
    ? `Tabungan · ${priorityGoal.name}`
    : "Tabungan goals";

  const auto: LeftoverEnvelope[] = [];
  if (goalsTarget > 0) {
    auto.push({
      key: priorityGoal ? `goals:${priorityGoal.id}` : "goals",
      label: goalsLabel,
      amount: goalsTarget,
      source: "AUTO",
      kind: "GOALS",
    });
  }
  if (bufferTarget > 0) {
    auto.push({
      key: "cash_buffer",
      label: "Uang fisik dompet (toko kecil / non-QRIS)",
      amount: bufferTarget,
      source: "AUTO",
      kind: "CASH_BUFFER",
    });
  }
  if (living > 0) {
    auto.push({
      key: "living",
      label: "Belanja debit / QRIS",
      amount: living,
      source: "AUTO",
      kind: "LIVING",
    });
  }

  const hasManualCcCap = manual.some((e) => e.kind === "CC_SPEND_CAP");
  const ccCap = roundMoney(input.ccSpendCap);
  if (ccCap > 0 && !hasManualCcCap) {
    auto.push({
      key: "cc_spend_cap",
      label: "Plafon belanja CC (seperti debit)",
      amount: ccCap,
      source: "AUTO",
      kind: "CC_SPEND_CAP",
    });
  }

  return [...manual, ...auto];
}
