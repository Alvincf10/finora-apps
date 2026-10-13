/** Minimal money util smoke checks (mirrors src/lib/money.ts). */

const CURRENCY_SCALE = { IDR: 1, EUR: 100 };

function toMinorUnits(majorAmount, currency) {
  return Math.round(majorAmount * CURRENCY_SCALE[currency]);
}

function fromMinorUnits(minorAmount, currency) {
  return minorAmount / CURRENCY_SCALE[currency];
}

function percent(numerator, denominator) {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(toMinorUnits(10.5, "EUR") === 1050, "EUR to cents");
assert(fromMinorUnits(1050, "EUR") === 10.5, "EUR from cents");
assert(toMinorUnits(100000, "IDR") === 100000, "IDR passthrough");
assert(percent(25, 100) === 25, "percent");

console.log("money utils OK");
