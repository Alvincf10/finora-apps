/**
 * Phase 2 pure-math smoke checks (mirrors src/lib/financial/phase2-math.ts logic).
 */

function weightedAverage3(amountsNewestFirst) {
  if (amountsNewestFirst.length === 0) return 0;
  const [m1 = 0, m2 = 0, m3 = 0] = amountsNewestFirst;
  if (amountsNewestFirst.length === 1) return Math.round(m1);
  if (amountsNewestFirst.length === 2) return Math.round(m1 * 0.6 + m2 * 0.4);
  return Math.round(m1 * 0.5 + m2 * 0.3 + m3 * 0.2);
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function detectAnomaly(currentAmount, historicalAmounts) {
  if (historicalAmounts.length < 2) return { isAnomaly: false };
  const average = mean(historicalAmounts);
  const sd = stdDev(historicalAmounts);
  const threshold = sd > 0 ? average + 2 * sd : average * 1.5;
  return { isAnomaly: currentAmount > threshold, threshold };
}

function projectCategorySpend(spentSoFar, dayOfMonth, daysInMonth) {
  if (dayOfMonth <= 0) return spentSoFar;
  return Math.round((spentSoFar / dayOfMonth) * daysInMonth);
}

function calculateEmergencyCoverage(fund, essential) {
  if (essential <= 0) return null;
  return Math.round((fund / essential) * 100) / 100;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(weightedAverage3([100, 80, 60]) === 86, "weighted avg");
assert(detectAnomaly(2100, [800, 850, 900, 950]).isAnomaly === true, "anomaly");
assert(projectCategorySpend(600000, 10, 31) === 1860000, "velocity");
assert(calculateEmergencyCoverage(15000000, 5000000) === 3, "emergency");

console.log("phase2 math OK");
