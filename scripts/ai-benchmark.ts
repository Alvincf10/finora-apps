/**
 * Phase 5.2 / 5.2-G Reasoning Benchmark runner.
 *
 * Default: mock (no OpenRouter) — safe for CI. Mode is NEVER ambiguous:
 *   report.mode === "mock" | "live"
 * Live: --live --models=id1 (OPENROUTER_API_KEY; free models only)
 *
 * Continues after case failures. Stops a model early if provider errors hit
 * --max-provider-errors (default 5). Writes JSON after each case + SIGINT.
 *
 * Outcomes (PRD 5.2-G-A): PASS | CRIT | FAIL | ERROR | SKIP
 * ERROR = technical/provider — excluded from quality pass-rate.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import {
  DECISION_ADVISOR_SYSTEM,
  FINANCIAL_EXPLAINER_SYSTEM,
} from "../src/lib/ai/system-prompt";
import { isAllowedFreeModel } from "../src/lib/ai/model-registry";
import { OpenRouterProvider } from "../src/lib/ai/provider";
import { isAIError } from "../src/lib/ai/errors";
import {
  buildEvalPrompt,
  loadBenchmarkDataset,
} from "../src/lib/ai/eval/load-dataset";
import {
  scoreBenchmarkResponse,
  summarizeScores,
} from "../src/lib/ai/eval/score-response";
import {
  classifyCaseFailure,
  type FailureCategory,
} from "../src/lib/ai/eval/failure-classify";
import { mockAnswer } from "../src/lib/ai/eval/mock-answer";
import {
  countOutcomes,
  resolveCaseOutcome,
  type CaseOutcome,
} from "../src/lib/ai/eval/outcome";
import { evaluateQualityGate } from "../src/lib/ai/eval/quality-gate";
import { redactSecrets } from "../src/lib/ai/eval/redact";
import type { CaseScore } from "../src/lib/ai/eval/types";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

type Args = {
  live: boolean;
  models: string[];
  limit: number | null;
  out: string;
  delayMs: number;
  maxProviderErrors: number;
};

type CaseRow = {
  caseId: string;
  category: string;
  contextType: string;
  requestedModel: string;
  actualModel: string | null;
  latencyMs: number;
  providerError?: string;
  providerErrorCode?: string;
  providerHttpStatus?: number;
  failureCategory: FailureCategory;
  outcome: CaseOutcome;
  outcomeReason: string;
  qualityCriticalFail: boolean;
  providerFailure: boolean;
  score: CaseScore;
  /** Redacted answer for diagnosis (not full financial dump by default). */
  answerRedacted: string;
  answerPreview: string;
  inputTokens?: number;
  outputTokens?: number;
  liveCallVerified?: boolean;
};

type ModelReport = {
  modelId: string;
  mode: "mock" | "live";
  stoppedEarly?: string;
  summary: ReturnType<typeof summarizeScores>;
  outcomeCounts: Record<CaseOutcome, number>;
  categoryCounts: Record<string, number>;
  qualitySummary: {
    testedForQuality: number;
    qualityPassed: number;
    qualityCriticalFail: number;
    softFail: number;
  };
  reliabilitySummary: {
    providerFailures: number;
    parseOrEmpty: number;
    technicalErrors: number;
  };
  qualityGate: ReturnType<typeof evaluateQualityGate>;
  cases: CaseRow[];
};

function parseArgs(argv: string[]): Args {
  const live = argv.includes("--live");
  const modelsArg = argv.find((a) => a.startsWith("--models="));
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const outArg = argv.find((a) => a.startsWith("--out="));
  const delayArg = argv.find((a) => a.startsWith("--delay-ms="));
  const maxPe = argv.find((a) => a.startsWith("--max-provider-errors="));

  const defaultModels = [
    "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "xingchen-agi/xing4.0-29b-a4b:free",
  ];

  const models = modelsArg
    ? modelsArg
        .slice("--models=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : defaultModels;

  return {
    live,
    models,
    limit: limitArg ? Number(limitArg.slice("--limit=".length)) : null,
    out:
      outArg?.slice("--out=".length) ??
      resolve(
        process.cwd(),
        `docs/ai-eval/results/benchmark-${new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[:T]/g, "-")}.json`
      ),
    delayMs: delayArg ? Number(delayArg.slice("--delay-ms=".length)) : 1000,
    maxProviderErrors: maxPe
      ? Number(maxPe.slice("--max-provider-errors=".length))
      : 5,
  };
}

async function sleep(ms: number) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

function systemForCase(contextType: string): string {
  return contextType === "decision_advisor"
    ? DECISION_ADVISOR_SYSTEM
    : FINANCIAL_EXPLAINER_SYSTEM;
}

function buildModelReport(
  modelId: string,
  live: boolean,
  rows: CaseRow[],
  stoppedEarly: string | undefined,
  expectedCaseCount: number
): ModelReport {
  const qualityRows = rows.filter(
    (r) => r.outcome === "PASS" || r.outcome === "CRIT" || r.outcome === "FAIL"
  );
  const categoryCounts: Record<string, number> = {};
  for (const r of rows) {
    categoryCounts[r.failureCategory] =
      (categoryCounts[r.failureCategory] ?? 0) + 1;
  }
  const outcomeCounts = countOutcomes(rows.map((r) => r.outcome));
  const qualityGate = evaluateQualityGate(
    rows.map((r) => ({
      outcome: r.outcome,
      failedMetricKeys: r.score.metrics.filter((m) => !m.pass).map((m) => m.key),
      evaluatedMetricKeys: r.score.metrics.map((m) => m.key),
    })),
    { expectedCaseCount, stoppedEarly: stoppedEarly ?? null }
  );

  return {
    modelId,
    mode: live ? "live" : "mock",
    stoppedEarly,
    summary: summarizeScores(rows.map((r) => r.score)),
    outcomeCounts,
    categoryCounts,
    qualitySummary: {
      testedForQuality: qualityRows.length,
      qualityPassed: qualityRows.filter((r) => r.outcome === "PASS").length,
      qualityCriticalFail: qualityRows.filter((r) => r.outcome === "CRIT")
        .length,
      softFail: qualityRows.filter((r) => r.outcome === "FAIL").length,
    },
    reliabilitySummary: {
      providerFailures: rows.filter((r) => r.providerFailure).length,
      parseOrEmpty: rows.filter(
        (r) =>
          r.failureCategory === "response_parse" ||
          r.failureCategory === "invalid_or_empty_output"
      ).length,
      technicalErrors: outcomeCounts.ERROR,
    },
    qualityGate,
    cases: rows,
  };
}

function buildPayload(
  datasetVersion: string,
  live: boolean,
  caseCount: number,
  reports: ModelReport[],
  partial: boolean
) {
  return {
    version: datasetVersion,
    promptBundle: "phase5.2-g-1",
    ranAt: new Date().toISOString(),
    live,
    mode: live ? "live" : "mock",
    liveProviderVerified: live,
    partial,
    caseCount,
    freeRouteCompliance: true,
    qualityGateTargets: {
      criticalFailures: 0,
      totalPassRateMinPct: 90,
      contextAdherenceMinPct: 95,
      instructionComplianceMinPct: 95,
    },
    reports,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataset = loadBenchmarkDataset();
  const cases =
    args.limit && args.limit > 0
      ? dataset.cases.slice(0, args.limit)
      : dataset.cases;

  for (const model of args.models) {
    if (!isAllowedFreeModel(model)) {
      throw new Error(`Refusing non-free / disallowed model: ${model}`);
    }
  }

  if (args.live) {
    loadEnvLocal();
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      throw new Error("OPENROUTER_API_KEY required for --live");
    }
  } else {
    console.log(
      "Mode: MOCK — no provider calls. Use --live for real OpenRouter requests."
    );
  }

  const provider = args.live
    ? new OpenRouterProvider({
        timeoutMs: 60_000,
        maxTokensDefault: 1200,
      })
    : null;

  const reports: ModelReport[] = [];

  const flush = (partial: boolean) => {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(
      args.out,
      JSON.stringify(
        buildPayload(
          dataset.version,
          args.live,
          cases.length,
          reports,
          partial
        ),
        null,
        2
      ) + "\n"
    );
  };

  const onSignal = () => {
    flush(true);
    console.error(
      `\nInterrupted — partial results saved to ${args.out}` +
        `\nStop reason: signal (SIGINT/SIGTERM)`
    );
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  for (const modelId of args.models) {
    const rows: CaseRow[] = [];
    let providerErrorStreak = 0;
    let stoppedEarly: string | undefined;
    console.log(`\n=== ${args.live ? "LIVE" : "MOCK"} · ${modelId} ===`);
    if (args.live) {
      console.log(
        `  provider=OpenRouter · dataset=${dataset.version} · cases=${cases.length}`
      );
    }

    for (const c of cases) {
      const started = Date.now();
      let answer = "";
      let actualModel: string | null = null;
      let providerError: string | undefined;
      let providerErrorCode: string | undefined;
      let providerHttpStatus: number | undefined;
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;
      let liveCallVerified = false;

      try {
        if (!args.live || !provider) {
          answer = mockAnswer(c);
          actualModel = `mock:${modelId}`;
        } else {
          const prompt = buildEvalPrompt(c);
          const res = await provider.generateTextOnModel(modelId, {
            system: systemForCase(c.contextType),
            prompt,
            maxTokens: 1200,
          });
          answer = res.text;
          actualModel = res.model ?? modelId;
          inputTokens = res.inputTokens;
          outputTokens = res.outputTokens;
          liveCallVerified = true;
          await sleep(args.delayMs);
        }
        providerErrorStreak = 0;
      } catch (e) {
        providerError = e instanceof Error ? e.message : String(e);
        providerErrorCode = isAIError(e) ? e.code : "UNKNOWN";
        providerHttpStatus = isAIError(e) ? e.status : undefined;
        answer = "";
        providerErrorStreak += 1;
      }

      const score = scoreBenchmarkResponse(c, answer.trim() ? answer : answer);
      if (!answer.trim() && !providerError) {
        score.criticalFail = true;
        score.passed = false;
      }

      const providerFailure = Boolean(providerError);
      const failureCategory = classifyCaseFailure({
        providerError,
        answer,
        score,
      });
      const qualityCriticalFail = !providerFailure && score.criticalFail;
      const { outcome, reason: outcomeReason } = resolveCaseOutcome({
        providerFailure,
        failureCategory,
        score,
        qualityCriticalFail,
      });

      rows.push({
        caseId: c.id,
        category: c.category,
        contextType: c.contextType,
        requestedModel: modelId,
        actualModel,
        latencyMs: Date.now() - started,
        providerError,
        providerErrorCode,
        providerHttpStatus,
        failureCategory,
        outcome,
        outcomeReason,
        qualityCriticalFail,
        providerFailure,
        score,
        answerRedacted: redactSecrets(answer, 2500),
        answerPreview: redactSecrets(answer.slice(0, 400)),
        inputTokens,
        outputTokens,
        liveCallVerified: args.live ? liveCallVerified : false,
      });

      console.log(
        `  [${outcome}] ${c.id} (${Date.now() - started}ms) · ${failureCategory}` +
          (actualModel && actualModel !== modelId
            ? ` · actual=${actualModel}`
            : "")
      );

      const modelReport = buildModelReport(
        modelId,
        args.live,
        rows,
        stoppedEarly,
        cases.length
      );
      const existing = reports.findIndex((r) => r.modelId === modelId);
      if (existing >= 0) reports[existing] = modelReport;
      else reports.push(modelReport);
      flush(true);

      if (providerErrorStreak >= args.maxProviderErrors) {
        stoppedEarly = `Stopped after ${providerErrorStreak} consecutive provider errors (quota protection)`;
        modelReport.stoppedEarly = stoppedEarly;
        modelReport.qualityGate = evaluateQualityGate(
          rows.map((r) => ({
            outcome: r.outcome,
            failedMetricKeys: r.score.metrics
              .filter((m) => !m.pass)
              .map((m) => m.key),
            evaluatedMetricKeys: r.score.metrics.map((m) => m.key),
          })),
          { expectedCaseCount: cases.length, stoppedEarly }
        );
        console.log(`  → ${stoppedEarly}`);
        break;
      }
    }

    // Remaining cases after early stop → SKIP with reason
    if (stoppedEarly && rows.length < cases.length) {
      for (const c of cases.slice(rows.length)) {
        const emptyScore = scoreBenchmarkResponse(c, "");
        const { outcome, reason } = resolveCaseOutcome({
          skipped: true,
          skipReason: stoppedEarly,
          providerFailure: false,
          failureCategory: "none",
          score: emptyScore,
          qualityCriticalFail: false,
        });
        rows.push({
          caseId: c.id,
          category: c.category,
          contextType: c.contextType,
          requestedModel: modelId,
          actualModel: null,
          latencyMs: 0,
          failureCategory: "none",
          outcome,
          outcomeReason: reason,
          qualityCriticalFail: false,
          providerFailure: false,
          score: emptyScore,
          answerRedacted: "",
          answerPreview: "",
          liveCallVerified: false,
        });
      }
      const idx = reports.findIndex((r) => r.modelId === modelId);
      reports[idx!] = buildModelReport(
        modelId,
        args.live,
        rows,
        stoppedEarly,
        cases.length
      );
      flush(true);
    }

    const final = reports.find((r) => r.modelId === modelId)!;
    console.log(
      `  → outcomes PASS=${final.outcomeCounts.PASS} CRIT=${final.outcomeCounts.CRIT}` +
        ` FAIL=${final.outcomeCounts.FAIL} ERROR=${final.outcomeCounts.ERROR}` +
        ` SKIP=${final.outcomeCounts.SKIP}`
    );
    console.log(
      `  → qualityGate=${final.qualityGate.decision}` +
        (final.qualityGate.reasons.length
          ? ` (${final.qualityGate.reasons[0]})`
          : "")
    );
  }

  flush(false);
  console.log(`\nWrote ${args.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
