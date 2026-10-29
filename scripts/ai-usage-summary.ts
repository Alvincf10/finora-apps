/**
 * Summarize Finora AI usage log for 5.2-F / 5.2-G monitoring.
 * Usage: npx tsx --tsconfig tsconfig.json scripts/ai-usage-summary.ts [path]
 * Never prints prompts or financial context — metadata only.
 *
 * Cost: if token/cost fields are absent, report "unavailable" — never invent 0.
 */
import { existsSync, readFileSync } from "fs";
import {
  getAiFeatureFlags,
} from "../src/lib/ai/feature-flags";

const path =
  process.argv[2] ||
  process.env.FINORA_AI_USAGE_LOG_PATH ||
  process.env.FINORA_COST_LEDGER_PATH ||
  "/var/lib/openclaw-cost/ledger.jsonl";

type Row = {
  agent_name?: string;
  contextType?: string;
  taskType?: string;
  status?: string;
  errorCode?: string;
  latencyMs?: number;
  fallbackUsed?: boolean;
  model?: string | null;
  routerEnabled?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  total_cost?: number;
};

function avg(xs: number[]): number | null {
  if (!xs.length) return null;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

function pct(xs: number[]): { p50: number | null; p95: number | null } {
  if (!xs.length) return { p50: null, p95: null };
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) =>
    s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]!;
  return { p50: at(0.5), p95: at(0.95) };
}

function main() {
  if (!existsSync(path)) {
    console.error(`No log at ${path}`);
    process.exit(1);
  }
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const rows: Row[] = [];
  for (const line of lines) {
    try {
      const o = JSON.parse(line) as Row;
      if (o.agent_name && o.agent_name !== "finora") continue;
      if (!o.contextType && !o.taskType) continue;
      rows.push(o);
    } catch {
      /* skip bad lines */
    }
  }

  const byContext: Record<string, { ok: number; err: number; lat: number[] }> =
    {};
  const byTask: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  let fallbacks = 0;
  let routerOn = 0;
  let timeouts = 0;
  let providerFails = 0;
  const errors: Record<string, number> = {};
  let tokenSum = 0;
  let tokenRows = 0;
  let costSum = 0;
  let costRows = 0;

  for (const r of rows) {
    const key = r.contextType ?? "unknown";
    if (!byContext[key]) byContext[key] = { ok: 0, err: 0, lat: [] };
    if (r.status === "ok") byContext[key].ok += 1;
    else {
      byContext[key].err += 1;
      if (r.errorCode) errors[r.errorCode] = (errors[r.errorCode] ?? 0) + 1;
      if (r.errorCode === "AI_TIMEOUT") timeouts += 1;
      if (
        r.errorCode === "AI_PROVIDER_UNAVAILABLE" ||
        r.errorCode === "AI_RATE_LIMITED"
      ) {
        providerFails += 1;
      }
    }
    if (typeof r.latencyMs === "number") byContext[key].lat.push(r.latencyMs);
    if (r.fallbackUsed) fallbacks += 1;
    if (r.routerEnabled) routerOn += 1;
    if (r.taskType) byTask[r.taskType] = (byTask[r.taskType] ?? 0) + 1;
    if (r.model) byModel[r.model] = (byModel[r.model] ?? 0) + 1;
    if (
      typeof r.inputTokens === "number" ||
      typeof r.outputTokens === "number"
    ) {
      tokenRows += 1;
      tokenSum += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
    }
    const cost =
      typeof r.costUsd === "number"
        ? r.costUsd
        : typeof r.total_cost === "number"
          ? r.total_cost
          : null;
    if (cost != null) {
      costRows += 1;
      costSum += cost;
    }
  }

  const allLat = rows
    .map((r) => r.latencyMs)
    .filter((n): n is number => typeof n === "number");
  const { p50, p95 } = pct(allLat);
  const meanLat = avg(allLat);

  let flagsNote = "unavailable (import failed or env not loaded)";
  try {
    const flags = getAiFeatureFlags();
    flagsNote = JSON.stringify({
      scenarioExplainer: flags.scenarioExplainer,
      decisionAdvisor: flags.decisionAdvisor,
      routerEnabled: flags.routerEnabled,
      baselineModel: flags.baselineModelHint,
    });
  } catch {
    /* keep unavailable */
  }

  console.log(`=== Finora AI usage · ${path} · ${rows.length} requests ===\n`);
  console.log("Note: request count ≠ token count ≠ cost.");
  console.log(
    `Latency overall: avg=${meanLat ?? "unavailable"}ms` +
      ` p50=${p50 ?? "unavailable"}ms p95=${p95 ?? "unavailable"}ms`
  );
  console.log(`Timeouts: ${timeouts} · provider-unavailable-ish: ${providerFails}`);
  console.log(`Fallbacks used: ${fallbacks}`);
  console.log(`Requests logged with routerEnabled=true: ${routerOn}`);
  console.log(
    `Tokens (sum where present): ${
      tokenRows ? `${tokenSum} across ${tokenRows} rows` : "unavailable"
    }`
  );
  console.log(
    `Cost (sum where present): ${
      costRows ? costSum : "unavailable — do not assume $0"
    }`
  );
  console.log(`\nRuntime feature flags (this process): ${flagsNote}`);

  console.log("\nBy contextType:");
  for (const [k, v] of Object.entries(byContext).sort()) {
    const lp = pct(v.lat);
    console.log(
      `  ${k}: ok=${v.ok} err=${v.err}` +
        ` latency_p50=${lp.p50 ?? "n/a"}ms p95=${lp.p95 ?? "n/a"}ms`
    );
  }
  if (Object.keys(byTask).length) {
    console.log("\nBy taskType:");
    for (const [k, n] of Object.entries(byTask).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k}: ${n}`);
    }
  }
  if (Object.keys(byModel).length) {
    console.log("\nBy model:");
    for (const [k, n] of Object.entries(byModel).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k}: ${n}`);
    }
  }
  if (Object.keys(errors).length) {
    console.log("\nError codes:");
    for (const [c, n] of Object.entries(errors).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${c}: ${n}`);
    }
  }
}

main();
