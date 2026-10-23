/** Smoke: balance query detector (mirrors query-balance.parseBalanceQuery). */

function parseBalanceQuery(text) {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return false;
  if (/^(?:\/)?saldo\b/.test(t)) return true;
  if (/^(?:\/)?balance\b/.test(t)) return true;
  if (/^cek\s+saldo\b/.test(t)) return true;
  return false;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(parseBalanceQuery("saldo"), "saldo");
assert(parseBalanceQuery("/saldo"), "/saldo");
assert(parseBalanceQuery("cek saldo"), "cek saldo");
assert(parseBalanceQuery("balance"), "balance");
assert(parseBalanceQuery("saldo dong"), "saldo\\b");
assert(!parseBalanceQuery("total pengeluaran"), "totals");
assert(!parseBalanceQuery("makan 50rb"), "expense");

console.log("wa balance OK");
