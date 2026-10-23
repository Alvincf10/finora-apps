import assert from "node:assert/strict";
import { estimateCostUsd, resolvePrice } from "../src/cost-ledger/calc.mjs";
import { classifyTask } from "../src/router/classify.mjs";
import { evaluateBudget } from "../src/cost-ledger/ledger.mjs";
import pricing from "../config/pricing.json" with { type: "json" };
import budget from "../config/budget.json" with { type: "json" };

// Cost calc
{
  const { price } = resolvePrice(pricing, "google", "gemini-2.5-flash");
  const usd = estimateCostUsd({ input: 1_000_000, output: 0 }, price);
  assert.equal(usd, 0.3);
  const usd2 = estimateCostUsd({ input: 0, output: 1_000_000 }, price);
  assert.equal(usd2, 2.5);
}

{
  const { price } = resolvePrice(pricing, "openrouter", "qwen/qwen3-coder:free");
  assert.equal(estimateCostUsd({ input: 99999, output: 99999 }, price), 0);
}

// Router (Vira strips "finora " before classify/handlers see the body)
assert.equal(classifyTask("saldo").llm, false);
assert.equal(classifyTask("/saldo").task_type, "saldo");
assert.equal(classifyTask("cek saldo").task_type, "saldo");
assert.equal(classifyTask("total pengeluaran").task_type, "pengeluaran");
assert.equal(classifyTask("add task beli susu").path, "deterministic_planner");
assert.equal(classifyTask("diskusi arsitektur").model_tier, "strong");
assert.equal(classifyTask("halo apa kabar").model_tier, "economy");
assert.equal(classifyTask("finora saldo").llm, true); // prefix not stripped here

// Budget gate
{
  const g = evaluateBudget(budget, 0);
  assert.equal(g.allow, true);
  assert.equal(g.blockPro, false);
}
{
  const g = evaluateBudget(budget, 4.2); // 70% of $6 target
  assert.equal(g.blockPro, true);
  assert.equal(g.allow, true);
}
{
  const g = evaluateBudget(budget, 10);
  assert.equal(g.allow, false);
  assert.ok(g.message);
}

console.log("cost-calc + router + budget OK");
