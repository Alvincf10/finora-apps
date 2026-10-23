import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { estimateCostUsd, resolvePrice } from "./calc.mjs";

function ensureParent(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function monthKey(date = new Date(), timeZone = "Asia/Jakarta") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

/**
 * @param {object} entry
 * @param {object} opts
 */
export function appendLedgerEntry(entry, opts) {
  const ledgerPath = opts.ledgerPath;
  ensureParent(ledgerPath);
  const line = JSON.stringify(entry) + "\n";
  appendFileSync(ledgerPath, line, { encoding: "utf8", mode: 0o600 });
}

export function readLedgerEntries(ledgerPath, { month, timeZone = "Asia/Jakarta" } = {}) {
  if (!existsSync(ledgerPath)) return [];
  const text = readFileSync(ledgerPath, "utf8");
  const target = month ?? monthKey(new Date(), timeZone);
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const mk = row.month_key ?? monthKey(new Date(row.ts), timeZone);
      if (mk === target) out.push(row);
    } catch {
      // skip corrupt lines
    }
  }
  return out;
}

export function sumMonthCostUsd(ledgerPath, opts = {}) {
  return readLedgerEntries(ledgerPath, opts).reduce(
    (sum, row) => sum + (Number(row.estimated_cost_usd) || 0),
    0
  );
}

export function buildEntryFromLlmOutput(event, ctx, pricing, budgetCfg) {
  const provider = event.provider ?? "unknown";
  const model = event.model ?? "unknown";
  const usage = event.usage ?? {};
  const { key, price } = resolvePrice(pricing, provider, model);
  const estimated = estimateCostUsd(usage, price);
  const tz = budgetCfg.monthTimezone ?? "Asia/Jakarta";
  const now = new Date();
  return {
    request_id: event.runId ?? ctx?.runId ?? null,
    agent_name: "openclaw",
    task_type: ctx?.taskType ?? "chat",
    provider,
    model,
    pricing_key: key,
    input_tokens: usage.input ?? 0,
    output_tokens: usage.output ?? 0,
    cache_read_tokens: usage.cacheRead ?? 0,
    cache_write_tokens: usage.cacheWrite ?? 0,
    estimated_cost_usd: estimated,
    latency_ms: null,
    tool_call_count: null,
    status: "ok",
    fallback_used: false,
    error_code: null,
    session_key: ctx?.sessionKey ?? event.sessionId ?? null,
    month_key: monthKey(now, tz),
    ts: now.toISOString(),
  };
}

export function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function saveJson(path, data) {
  ensureParent(path);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}

/**
 * Budget gate.
 * @returns {{ allow: boolean, spend: number, hardLimit: number, pct: number, warnings: number[], blockPro: boolean, message?: string }}
 */
export function evaluateBudget(budgetCfg, spendUsd) {
  const hard = Number(budgetCfg.hardLimitUsd ?? 10);
  const target = Number(budgetCfg.monthlyTargetUsd ?? 6);
  const softPct = Number(budgetCfg.softBlockProAtPct ?? 0.7);
  const pct = hard > 0 ? spendUsd / hard : 0;
  const warnings = (budgetCfg.warnAtPct ?? [0.7, 0.85]).filter((w) => pct >= w);
  const allow = spendUsd < hard;
  const blockPro = spendUsd >= target * softPct || pct >= softPct;
  let message;
  if (!allow) {
    message =
      "Budget AI bulanan sudah mencapai hard limit. Perintah keuangan deterministik (finora saldo / total) tetap bisa dipakai.";
  }
  return { allow, spend: spendUsd, hardLimit: hard, target, pct, warnings, blockPro, message };
}
