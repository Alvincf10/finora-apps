import { randomUUID } from "crypto";
import { ok, fail, handleError } from "@/lib/api";
import {
  buildAIExplainContext,
  type AIContextType,
} from "@/lib/ai/context-builder";
import { isAIError } from "@/lib/ai/errors";
import {
  assertAIRateLimit,
  getAIProvider,
  isAIConfigured,
} from "@/lib/ai/provider";
import {
  routeAiGenerate,
  shouldUseModelRouter,
} from "@/lib/ai/model-router";
import {
  isDecisionAdvisorEnabled,
  isScenarioExplainerEnabled,
} from "@/lib/ai/feature-flags";
import {
  DECISION_ADVISOR_SYSTEM,
  FINANCIAL_EXPLAINER_SYSTEM,
} from "@/lib/ai/system-prompt";
import { taskTypeFromContext } from "@/lib/ai/task-types";
import { validateAiExplanation } from "@/lib/ai/response-validator";
import { appendAIUsageLog, hashUserId } from "@/lib/ai/usage-log";
import { requireUser } from "@/lib/session";
import { aiExplainSchema } from "@/lib/validations";
import { AIError } from "@/lib/ai/errors";

function systemPromptForContext(contextType: AIContextType): string {
  return contextType === "decision_advisor"
    ? DECISION_ADVISOR_SYSTEM
    : FINANCIAL_EXPLAINER_SYSTEM;
}

function assertFeatureEnabled(contextType: AIContextType): void {
  if (contextType === "scenario" && !isScenarioExplainerEnabled()) {
    throw new AIError(
      "AI_NOT_CONFIGURED",
      "Scenario Explainer sedang dinonaktifkan (rollout). Financial Explainer dan perhitungan Finora tetap tersedia.",
      503
    );
  }
  if (contextType === "decision_advisor" && !isDecisionAdvisorEnabled()) {
    throw new AIError(
      "AI_NOT_CONFIGURED",
      "Decision Advisor sedang dinonaktifkan (rollout). Financial Explainer dan perhitungan Finora tetap tersedia.",
      503
    );
  }
}

function buildContextBlock(
  context: Awaited<ReturnType<typeof buildAIExplainContext>>
): string {
  return [
    `Jenis konteks: ${context.contextType}`,
    `Mata uang: ${context.currency}`,
    `Periode: ${JSON.stringify(context.period)}`,
    context.dataLimitations.length
      ? `Batasan data: ${context.dataLimitations.join(", ")}`
      : null,
    "Ringkasan finansial (sumber kebenaran Finora):",
    JSON.stringify(context.payload, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * POST /api/ai/explain — Financial Explainer (Phase 5 + optional 5.1 router).
 * Read-only: never mutates ledger / budgets / debts / roadmap.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const requestId = randomUUID();
  let userIdForLog = "anon";
  let contextTypeForLog = "unknown";
  let taskTypeForLog: string | undefined;
  let modelForLog: string | null = null;
  let requestedModelForLog: string | null = null;
  let fallbackUsedForLog: boolean | undefined;
  let attemptsForLog: number | undefined;
  const routerEnabled = shouldUseModelRouter();

  try {
    const { userId } = await requireUser();
    userIdForLog = userId;

    if (!isAIConfigured()) {
      return fail(
        "AI_NOT_CONFIGURED",
        "Penjelasan AI belum tersedia. Data dan perhitungan keuangan Finora tetap berfungsi normal.",
        503
      );
    }

    assertAIRateLimit(userId);

    const body = aiExplainSchema.parse(await request.json().catch(() => ({})));
    const contextType = body.contextType as AIContextType;
    contextTypeForLog = contextType;
    assertFeatureEnabled(contextType);

    const context = await buildAIExplainContext(
      userId,
      contextType,
      body.contextRef
    );

    const taskType = taskTypeFromContext(contextType);
    taskTypeForLog = taskType;
    const contextBlock = buildContextBlock(context);

    let explanation: string;
    let model: string;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let metadata: {
      taskType: string;
      fallbackUsed: boolean;
      attempts: number;
      routerEnabled: boolean;
      validationWarnings?: string[];
    };

    const systemPrompt = systemPromptForContext(contextType);

    if (routerEnabled) {
      const routed = await routeAiGenerate({
        taskType,
        systemPrompt,
        contextBlock,
        question: body.question,
      });
      explanation = routed.explanation;
      model = routed.selectedModel;
      inputTokens = routed.inputTokens;
      outputTokens = routed.outputTokens;
      requestedModelForLog = routed.requestedModel;
      fallbackUsedForLog = routed.fallbackUsed;
      attemptsForLog = routed.attempts;
      metadata = {
        taskType: routed.requestedTask,
        fallbackUsed: routed.fallbackUsed,
        attempts: routed.attempts,
        routerEnabled: true,
      };
    } else {
      // Phase 5 baseline path — unchanged behavior when AI_ROUTER_ENABLED is off
      const provider = getAIProvider();
      const response = await provider.generateText({
        system: systemPrompt,
        prompt: [
          contextBlock,
          "",
          `Pertanyaan pengguna: ${body.question}`,
        ].join("\n"),
      });
      explanation = response.text;
      model = response.model;
      inputTokens = response.inputTokens;
      outputTokens = response.outputTokens;
      metadata = {
        taskType,
        fallbackUsed: false,
        attempts: 1,
        routerEnabled: false,
      };
    }

    const validated = validateAiExplanation(explanation, context.payload);
    explanation = validated.cleanedExplanation;
    if (validated.warnings.length) {
      metadata.validationWarnings = validated.warnings;
    }

    modelForLog = model;

    appendAIUsageLog({
      requestId,
      userIdHash: hashUserId(userId),
      contextType,
      taskType,
      model,
      requestedModel: requestedModelForLog,
      fallbackUsed: fallbackUsedForLog ?? false,
      attempts: attemptsForLog ?? 1,
      routerEnabled,
      status: "ok",
      latencyMs: Date.now() - started,
      inputTokens,
      outputTokens,
      ts: new Date().toISOString(),
    });

    return ok({
      explanation,
      model,
      contextType,
      disclaimer:
        "Jawaban dibuat AI berdasarkan data Finora. Angka di aplikasi adalah sumber kebenaran — AI tidak mengubah saldo atau transaksi.",
      // Optional Phase 5.1 / 5.2 fields — ignored by older UI
      metadata,
      validationWarnings: validated.warnings.length
        ? validated.warnings
        : undefined,
    });
  } catch (error) {
    if (isAIError(error)) {
      appendAIUsageLog({
        requestId,
        userIdHash: hashUserId(userIdForLog),
        contextType: contextTypeForLog,
        taskType: taskTypeForLog,
        model: modelForLog,
        requestedModel: requestedModelForLog,
        fallbackUsed: fallbackUsedForLog,
        attempts: attemptsForLog,
        routerEnabled,
        status: "error",
        errorCode: error.code,
        latencyMs: Date.now() - started,
        ts: new Date().toISOString(),
      });
      return fail(error.code, error.message, error.status);
    }

    appendAIUsageLog({
      requestId,
      userIdHash: hashUserId(userIdForLog),
      contextType: contextTypeForLog,
      taskType: taskTypeForLog,
      model: modelForLog,
      routerEnabled,
      status: "error",
      errorCode: "INTERNAL_ERROR",
      latencyMs: Date.now() - started,
      ts: new Date().toISOString(),
    });

    return handleError(error);
  }
}
