/** Smoke checks for WhatsApp expense parser (mirrors parse-expense.ts). */

function parseIdrAmount(raw) {
  const text = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;

  let m = text.match(/^(\d+(?:[.,]\d+)?)\s*(jt|juta)$/);
  if (m) {
    const n = Number(m[1].replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 1_000_000);
  }

  m = text.match(/^(\d+(?:[.,]\d+)?)\s*(rb|ribu|k)$/);
  if (m) {
    const n = Number(m[1].replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 1_000);
  }

  const digits = text.replace(/[.\s]/g, "").replace(",", "");
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(parseIdrAmount("50rb") === 50_000, "50rb");
assert(parseIdrAmount("1.5jt") === 1_500_000, "1.5jt");
assert(parseIdrAmount("25.000") === 25_000, "25.000");
assert(parseIdrAmount("35k") === 35_000, "35k");
assert(parseIdrAmount("10 juta") === 10_000_000, "10 juta");

console.log("wa parse OK");
