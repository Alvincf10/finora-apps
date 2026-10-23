/**
 * Deterministic smoke tests for Tangga Ternak Uang gate (PRD phase3 P0).
 * Run: npx tsx scripts/smoke-wealth-ladder.ts
 */
import assert from "node:assert/strict";
import {
  LADDER_CASH_TARGET_IDR,
  applySequentialGate,
  calculateEligibleLiquidBalanceIdr,
  calculateEmergencyCoverage,
  calculateInvestmentRate,
  calculateLadderProgress,
  resolveEssentialMonthly,
  syncStarterGoalAmount,
} from "../src/lib/financial/wealth-ladder-math";

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

// —— Regression: Step1 Rp0, Step6 no KPR → progress 0%, focus step 1 ——
{
  section("regression: step1 empty + step6 factual clear → 0% / focus 1");
  const gates = applySequentialGate([
    { step: 1, conditionMet: false },
    { step: 2, conditionMet: false },
    { step: 3, conditionMet: false },
    { step: 4, conditionMet: false },
    { step: 5, conditionMet: false },
    { step: 6, conditionMet: true }, // no KPR
    { step: 7, conditionMet: false },
  ]);
  const progress = calculateLadderProgress(gates);
  assert.equal(progress.progressPercent, 0);
  assert.equal(progress.completedRequiredSteps, 0);
  assert.equal(progress.activeStep, 1);
  assert.equal(gates[0].status, "FOCUS");
  assert.equal(gates[5].status, "LOCKED");
  assert.equal(gates[5].conditionMet, true);
  assert.equal(gates[5].creditedComplete, false);
}

// —— Prefix completes credit only ——
{
  section("sequential credit: 1–2 done, 3 focus");
  const gates = applySequentialGate([
    { step: 1, conditionMet: true },
    { step: 2, conditionMet: true },
    { step: 3, conditionMet: false },
    { step: 4, conditionMet: true },
    { step: 5, conditionMet: true },
    { step: 6, conditionMet: true },
    { step: 7, conditionMet: true },
  ]);
  const progress = calculateLadderProgress(gates);
  assert.equal(progress.completedRequiredSteps, 2);
  assert.equal(progress.progressPercent, Math.floor((2 / 7) * 100));
  assert.equal(gates[2].status, "FOCUS");
  assert.equal(gates[3].status, "LOCKED");
  assert.equal(gates[3].creditedComplete, false);
}

// —— UNKNOWN blocks ——
{
  section("UNKNOWN does not complete or skip");
  const gates = applySequentialGate([
    { step: 1, conditionMet: true },
    { step: 2, conditionMet: true },
    { step: 3, conditionMet: "UNKNOWN" },
    { step: 4, conditionMet: true },
  ]);
  assert.equal(gates[2].status, "UNKNOWN");
  assert.equal(gates[2].creditedComplete, false);
  assert.equal(gates[3].status, "LOCKED");
  const progress = calculateLadderProgress(gates);
  assert.equal(progress.completedRequiredSteps, 2);
  assert.equal(progress.activeStep, 3);
}

// —— NOT_APPLICABLE skipped in denominator ——
{
  section("NOT_APPLICABLE skipped in gate + denominator");
  const gates = applySequentialGate([
    { step: 1, conditionMet: true },
    { step: 2, conditionMet: true },
    { step: 3, conditionMet: true },
    { step: 4, conditionMet: true },
    { step: 5, conditionMet: false, notApplicable: true },
    { step: 6, conditionMet: false },
    { step: 7, conditionMet: false },
  ]);
  assert.equal(gates[4].status, "NOT_APPLICABLE");
  assert.equal(gates[5].status, "FOCUS");
  const progress = calculateLadderProgress(gates);
  assert.equal(progress.applicableRequiredSteps, 6);
  assert.equal(progress.completedRequiredSteps, 4);
  assert.equal(progress.progressPercent, Math.floor((4 / 6) * 100));
}

// —— Starter sync ——
{
  section("starter sync is contribution-only");
  assert.equal(syncStarterGoalAmount(0, 3_420_000), 0);
  assert.equal(syncStarterGoalAmount(1_000_000, 4_000_000), 1_000_000);
  assert.equal(
    syncStarterGoalAmount(12_000_000, 20_000_000),
    LADDER_CASH_TARGET_IDR
  );
}

// —— Liquid eligibility ——
{
  section("eligible liquid IDR only, floors at 0");
  const bal = calculateEligibleLiquidBalanceIdr([
    { currency: "IDR", type: "BANK", currentBalance: 5_000_000, isActive: true },
    { currency: "IDR", type: "CASH", currentBalance: -100, isActive: true },
    { currency: "EUR", type: "BANK", currentBalance: 9999, isActive: true },
    { currency: "IDR", type: "CREDIT_CARD", currentBalance: 500, isActive: true },
    { currency: "IDR", type: "BANK", currentBalance: 1_000_000, isActive: false },
  ]);
  assert.equal(bal, 5_000_000);
}

// —— Emergency / invest ——
{
  section("emergency UNKNOWN when essentials missing");
  assert.equal(
    calculateEmergencyCoverage(10_000_000, 0).conditionMet,
    "UNKNOWN"
  );
  assert.equal(
    calculateEmergencyCoverage(9_000_000, 3_000_000).conditionMet,
    true
  );
  assert.equal(
    calculateEmergencyCoverage(5_000_000, 3_000_000).conditionMet,
    false
  );

  section("invest UNKNOWN when income zero");
  assert.equal(calculateInvestmentRate(1_000_000, 0).conditionMet, "UNKNOWN");
  assert.equal(calculateInvestmentRate(200_000, 1_000_000).conditionMet, true);
  assert.equal(calculateInvestmentRate(199_000, 1_000_000).conditionMet, false);
}

{
  section("essentials fallback from emergency goal target");
  const resolved = resolveEssentialMonthly({
    essentialFromCategories: 0,
    averageFixedExpense: 0,
    averageMonthlyExpense: 0,
    emergencyGoalTarget: 30_000_000,
  });
  assert.equal(resolved.source, "goal_target");
  assert.equal(resolved.essentialMonthly, 10_000_000);
  const cov = calculateEmergencyCoverage(0, resolved.essentialMonthly);
  assert.equal(cov.conditionMet, false);
  assert.equal(cov.coverageMonths, 0);
}

console.log("\nAll wealth-ladder smoke tests passed.\n");
