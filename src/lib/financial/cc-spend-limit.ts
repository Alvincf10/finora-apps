/**
 * Pure CC spend-limit checks (safe for client + server).
 * Amounts are minor units.
 */

type CcLimitAccount = {
  type: string;
  creditLimit?: number | null;
  currentBalance?: number | null;
};

function isCreditCard(type: string): boolean {
  return type === "CREDIT_CARD";
}

function availableCreditMinor(account: CcLimitAccount): number | null {
  if (!isCreditCard(account.type)) return null;
  const limit = Math.max(0, account.creditLimit ?? 0);
  const outstanding = Math.max(0, account.currentBalance ?? 0);
  return Math.max(0, limit - outstanding);
}

/**
 * Remaining CC spend room in minor units.
 * `releasedAmountMinor` is used when editing an existing expense on the same card
 * (that amount is already counted in outstanding).
 * Returns null for non-CC accounts.
 */
export function ccSpendHeadroom(
  account: CcLimitAccount,
  releasedAmountMinor = 0
): number | null {
  const available = availableCreditMinor(account);
  if (available == null) return null;
  return available + Math.max(0, releasedAmountMinor);
}

/**
 * Block CC expenses when available limit is 0 or the amount exceeds remaining room.
 */
export function isCcExpenseBlocked(
  account: CcLimitAccount,
  expenseAmountMinor: number,
  releasedAmountMinor = 0
): boolean {
  const headroom = ccSpendHeadroom(account, releasedAmountMinor);
  if (headroom == null) return false;
  if (headroom <= 0) return true;
  return expenseAmountMinor > headroom;
}

export function assertCcExpenseWithinLimit(
  account: CcLimitAccount,
  expenseAmountMinor: number,
  releasedAmountMinor = 0
): void {
  if (isCcExpenseBlocked(account, expenseAmountMinor, releasedAmountMinor)) {
    throw new Error("CC_LIMIT_EXCEEDED");
  }
}
