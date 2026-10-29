/**
 * Free Model Router (PRD Phase 5.1 §9).
 * Selects model by task type; free-only fallback; no ledger mutations.
 */

import { AIError, isAIError } from "@/lib/ai/errors";
import {
  getAiMaxRetries,
  getRouteForTask,
  isAiRouterEnabled,
  MODEL_REGISTRY_VERSION,
} from "@/lib/ai/model-registry";
import {
  getAIProvider,
  OpenRouterProvider,
  type AIResponse,
} from "@/lib/ai/provider";
import type { AiTaskType } from "@/lib/ai/task-types";

export type AiRouteRequest = {
  taskType: AiTaskType;
  systemPrompt: string;
  /** Pre-built prompt block (context JSON + labels) — no ledger access */
  contextBlock: string;
  question: string;
};

export type AiRouteAttempt = {
  model: string;
  ok: boolean;
  errorCode?: string;
  latencyMs: number;
};

export type AiRouteResult = {
  explanation: string;
  requestedTask: AiTaskType;
  selectedModel: string;
  requestedModel: string;
  attempts: number;
  fallbackUsed: boolean;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  registryVersion: string;
  attemptLog: AiRouteAttempt[];
};

export type ModelRouterProvider = {
  generateTextOnModel: (
    modelId: string,
    input: { system: string; prompt: string; maxTokens?: number },
    opts?: { timeoutMs?: number }
  ) => Promise<AIResponse>;
};

function isRetryableProviderError(error: AIError): boolean {
  return (
    error.code === "AI_PROVIDER_UNAVAILABLE" ||
    error.code === "AI_RESPONSE_INVALID" ||
    error.code === "AI_TIMEOUT"
  );
}

function buildPrompt(req: AiRouteRequest): string {
  return [req.contextBlock, "", `Pertanyaan pengguna: ${req.question}`]
    .filter(Boolean)
    .join("\n");
}

export function shouldUseModelRouter(): boolean {
  return isAiRouterEnabled();
}

/**
 * Route a generate request: 1 primary + up to AI_MAX_RETRIES free fallbacks.
 * Wall-clock budget ≈ timeoutMs × (1 + retries).
 */
export async function routeAiGenerate(
  req: AiRouteRequest,
  provider?: ModelRouterProvider
): Promise<AiRouteResult> {
  const started = Date.now();
  const client: ModelRouterProvider =
    provider ??
    (getAIProvider() as OpenRouterProvider);

  const route = getRouteForTask(req.taskType);
  const maxRetries = getAiMaxRetries();
  const chain = [route.primaryModel, ...route.fallbackModels].slice(
    0,
    1 + maxRetries
  );

  const totalBudgetMs = route.timeoutMs * (1 + maxRetries);
  const attemptLog: AiRouteAttempt[] = [];
  let lastError: AIError | null = null;

  for (let i = 0; i < chain.length; i++) {
    const modelId = chain[i]!;
    const elapsed = Date.now() - started;
    const remaining = totalBudgetMs - elapsed;
    if (remaining < 1500) break;

    const attemptTimeout = Math.min(route.timeoutMs, remaining);
    const attemptStarted = Date.now();

    try {
      const response = await client.generateTextOnModel(
        modelId,
        {
          system: req.systemPrompt,
          prompt: buildPrompt(req),
          maxTokens: route.maxOutputTokens,
        },
        { timeoutMs: attemptTimeout }
      );

      attemptLog.push({
        model: modelId,
        ok: true,
        latencyMs: Date.now() - attemptStarted,
      });

      return {
        explanation: response.text,
        requestedTask: req.taskType,
        selectedModel: response.model || modelId,
        requestedModel: route.primaryModel,
        attempts: attemptLog.length,
        fallbackUsed: i > 0,
        latencyMs: Date.now() - started,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        registryVersion: MODEL_REGISTRY_VERSION,
        attemptLog,
      };
    } catch (error) {
      const latencyMs = Date.now() - attemptStarted;
      if (isAIError(error) && isRetryableProviderError(error)) {
        lastError = error;
        attemptLog.push({
          model: modelId,
          ok: false,
          errorCode: error.code,
          latencyMs,
        });
        continue;
      }
      if (isAIError(error)) {
        attemptLog.push({
          model: modelId,
          ok: false,
          errorCode: error.code,
          latencyMs,
        });
      }
      throw error;
    }
  }

  throw (
    lastError ??
    new AIError(
      "AI_PROVIDER_UNAVAILABLE",
      "Layanan penjelasan AI sedang tidak tersedia.",
      503
    )
  );
}
