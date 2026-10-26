/**
 * Emergency fund coverage in months.
 * Returns null when essentials are missing/zero (not 0%).
 */
export function calculateEmergencyCoverageMonths(
  emergencyFund: number,
  essentialMonthlyExpenses: number
): number | null {
  if (!(essentialMonthlyExpenses > 0)) return null;
  if (!Number.isFinite(emergencyFund)) return null;
  return Math.round((emergencyFund / essentialMonthlyExpenses) * 100) / 100;
}

/**
 * Documented Phase 1 defaults for emergency reserve (open decision §17.2):
 * prefer EMERGENCY_FUND goal currentAmount; else eligible liquid assets.
 * Allocated payday envelopes are NOT subtracted yet (needs FR-06 planned/actual).
 */
export function resolveEmergencyReserve(input: {
  emergencyGoalAmount: number | null;
  liquidAssets: number;
}): { amount: number; source: "goal" | "liquid_assets" } {
  if (input.emergencyGoalAmount != null && input.emergencyGoalAmount > 0) {
    return { amount: input.emergencyGoalAmount, source: "goal" };
  }
  return { amount: input.liquidAssets, source: "liquid_assets" };
}
