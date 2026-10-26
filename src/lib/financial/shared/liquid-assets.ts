import type { AccountType, Currency } from "@/types";

/** Default liquid account types for emergency / runway eligibility. */
export const DEFAULT_LIQUID_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set([
  "CASH",
  "BANK",
  "E_WALLET",
]);

export type LiquidAccountInput = {
  currency: string;
  type: string;
  isActive?: boolean;
  currentBalance?: number | null;
};

/**
 * Eligible liquid assets for one currency.
 *
 * Defaults (Phase 0 documented):
 * - Active CASH / BANK / E_WALLET only (not OTHER, not CREDIT_CARD)
 * - Floors each balance at 0
 * - Never mixes currencies
 */
export function calculateEligibleLiquidBalance(
  accounts: LiquidAccountInput[],
  currency: Currency,
  liquidTypes: ReadonlySet<string> = DEFAULT_LIQUID_ACCOUNT_TYPES
): number {
  return accounts
    .filter(
      (a) =>
        a.isActive !== false &&
        a.currency === currency &&
        liquidTypes.has(a.type) &&
        a.type !== "CREDIT_CARD"
    )
    .reduce((sum, a) => sum + Math.max(0, a.currentBalance ?? 0), 0);
}
