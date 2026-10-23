#!/usr/bin/env node
/**
 * Monthly cost report from ledger.jsonl
 * Usage: node prd_agent/assistant/scripts/cost-report.mjs [--month YYYY-MM]
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const budget = JSON.parse(
  readFileSync(resolve(__dirname, "../config/budget.json"), "utf8")
);

const args = process.argv.slice(2);
let month = null;
const mi = args.indexOf("--month");
if (mi >= 0) month = args[mi + 1];

function monthKey(date = new Date(), timeZone = "Asia/Jakarta") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  })
    .format(date)
    .slice(0, 7);
}

const target = month ?? monthKey(new Date(), budget.monthTimezone);
const ledgerPath = budget.ledgerPath;

if (!existsSync(ledgerPath)) {
  console.log(`No ledger yet at ${ledgerPath}`);
  console.log(`Month ${target}: $0.00 / hard $${budget.hardLimitUsd}`);
  process.exit(0);
}

const byModel = new Map();
const byAgent = new Map();
const byTask = new Map();
let total = 0;
let count = 0;
let inputTok = 0;
let outputTok = 0;

for (const line of readFileSync(ledgerPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  const mk = row.month_key ?? String(row.ts ?? "").slice(0, 7);
  if (mk !== target) continue;
  const cost = Number(row.estimated_cost_usd) || 0;
  total += cost;
  count += 1;
  inputTok += Number(row.input_tokens) || 0;
  outputTok += Number(row.output_tokens) || 0;
  const model = `${row.provider}/${row.model}`;
  byModel.set(model, (byModel.get(model) || 0) + cost);
  byAgent.set(row.agent_name || "?", (byAgent.get(row.agent_name || "?") || 0) + cost);
  byTask.set(row.task_type || "?", (byTask.get(row.task_type || "?") || 0) + cost);
}

const pct = budget.hardLimitUsd > 0 ? (total / budget.hardLimitUsd) * 100 : 0;

console.log(`# Cost report ${target}`);
console.log(`Ledger: ${ledgerPath}`);
console.log(`Requests: ${count}`);
console.log(`Tokens in/out: ${inputTok} / ${outputTok}`);
console.log(
  `Spend: $${total.toFixed(4)} · target $${budget.monthlyTargetUsd} · hard $${budget.hardLimitUsd} (${pct.toFixed(1)}%)`
);
console.log("\nBy model:");
for (const [k, v] of [...byModel.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: $${v.toFixed(4)}`);
}
console.log("\nBy agent:");
for (const [k, v] of [...byAgent.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: $${v.toFixed(4)}`);
}
console.log("\nBy task:");
for (const [k, v] of [...byTask.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: $${v.toFixed(4)}`);
}
