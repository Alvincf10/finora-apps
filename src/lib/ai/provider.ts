import {
  getAIDailyRequestLimit,
  getAIMaxOutputTokens,
  getAIPerMinuteLimit,
  getAIRequestTimeoutMs,
  getOpenRouterApiKey,
  getOpenRouterModel,
  isAIConfigured,
} from "@/lib/ai/config";
import { AIError } from "@/lib/ai/errors";
import { extractOpenRouterText } from "@/lib/ai/extract-text";
import {
  freeChatFallbackModels,
  isSafetyClassifierModel,
  looksLikeSafetyOnlyOutput,
} from "@/lib/ai/model-guard";
import { checkRateLimit } from "@/lib/rate-limit";

export interface AIRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface AIResponse {
  text: string;
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AIProvider {
  generateText(input: AIRequest): Promise<AIResponse>;
  /** Single-model call (no cascade) — used by Free Model Router */
  generateTextOnModel(
    modelId: string,
    input: AIRequest,
    opts?: { timeoutMs?: number }
  ): Promise<AIResponse>;
}

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | Array<{ type?: string; text?: string }> | null;
      refusal?: string | null;
      reasoning?: string | null;
      reasoning_details?: Array<{
        type?: string;
        text?: string;
        summary?: string;
        content?: string;
      }> | null;
    };
    finish_reason?: string | null;
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string; code?: string | number };
};

export class OpenRouterProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private siteUrl?: string;
  private appName?: string;
  private timeoutMs: number;
  private maxTokensDefault: number;

  constructor(opts?: {
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    maxTokensDefault?: number;
  }) {
    this.apiKey = opts?.apiKey ?? getOpenRouterApiKey();
    this.model = opts?.model ?? getOpenRouterModel();
    this.siteUrl = process.env.OPENROUTER_SITE_URL;
    this.appName = process.env.OPENROUTER_APP_NAME ?? "Finora";
    this.timeoutMs = opts?.timeoutMs ?? getAIRequestTimeoutMs();
    this.maxTokensDefault = opts?.maxTokensDefault ?? getAIMaxOutputTokens();
  }

  /**
   * Phase 5 path: primary + hard-coded free fallback chain (safety-aware).
   */
  async generateText(input: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new AIError(
        "AI_NOT_CONFIGURED",
        "Layanan penjelasan AI belum dikonfigurasi.",
        503
      );
    }

    const modelChain = freeChatFallbackModels(this.model);
    let lastError: AIError | null = null;

    for (const modelId of modelChain) {
      try {
        return await this.generateTextOnModel(modelId, input);
      } catch (error) {
        if (error instanceof AIError) {
          // Try next free model on rate limit / empty / bad classifier
          if (
            error.code === "AI_PROVIDER_UNAVAILABLE" ||
            error.code === "AI_RESPONSE_INVALID" ||
            error.code === "AI_TIMEOUT"
          ) {
            lastError = error;
            continue;
          }
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

  /**
   * Single-model call for Free Model Router (no internal cascade).
   * Timeout can be overridden per attempt by the router.
   */
  async generateTextOnModel(
    modelId: string,
    input: AIRequest,
    opts?: { timeoutMs?: number }
  ): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new AIError(
        "AI_NOT_CONFIGURED",
        "Layanan penjelasan AI belum dikonfigurasi.",
        503
      );
    }
    return this.callModel(modelId, input, opts?.timeoutMs ?? this.timeoutMs);
  }

  private async callModel(
    modelId: string,
    input: AIRequest,
    timeoutMs: number = this.timeoutMs
  ): Promise<AIResponse> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.siteUrl) headers["HTTP-Referer"] = this.siteUrl;
    if (this.appName) headers["X-Title"] = this.appName;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.prompt },
          ],
          max_tokens: input.maxTokens ?? this.maxTokensDefault,
          // Do NOT set reasoning.exclude — Nemotron Lightning free often returns
          // content=null + finish=length; excluding reasoning yields empty parses.
          // extractOpenRouterText already prefers content, then reasoning.
        }),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || /aborted/i.test(error.message))
      ) {
        throw new AIError(
          "AI_TIMEOUT",
          "Penjelasan AI melebihi batas waktu. Coba lagi nanti.",
          504
        );
      }
      throw new AIError(
        "AI_PROVIDER_UNAVAILABLE",
        "Layanan penjelasan AI sedang tidak tersedia.",
        503
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new AIError(
          "AI_PROVIDER_UNAVAILABLE",
          "Layanan penjelasan AI sedang tidak tersedia (batas kuota).",
          503
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new AIError(
          "AI_NOT_CONFIGURED",
          "Layanan penjelasan AI belum dikonfigurasi dengan benar.",
          503
        );
      }
      throw new AIError(
        "AI_PROVIDER_UNAVAILABLE",
        "Layanan penjelasan AI sedang tidak tersedia.",
        503
      );
    }

    let json: OpenRouterChatResponse;
    try {
      json = (await response.json()) as OpenRouterChatResponse;
    } catch {
      throw new AIError(
        "AI_RESPONSE_INVALID",
        "Respons AI tidak valid.",
        502
      );
    }

    const text = extractOpenRouterText(json.choices?.[0]?.message);
    if (!text) {
      throw new AIError(
        "AI_RESPONSE_INVALID",
        "Respons AI kosong atau tidak valid.",
        502
      );
    }

    const actualModel = json.model ?? modelId;
    if (
      isSafetyClassifierModel(actualModel) ||
      looksLikeSafetyOnlyOutput(text)
    ) {
      throw new AIError(
        "AI_RESPONSE_INVALID",
        "Model AI salah jalur (safety classifier). Coba lagi — Finora memakai model chat gratis.",
        502
      );
    }

    return {
      text,
      model: actualModel,
      provider: "openrouter",
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
    };
  }
}

export function getAIProvider(): AIProvider {
  return new OpenRouterProvider();
}

export { isAIConfigured };

/**
 * Enforce Finora-side limits: per-minute + daily (in-memory; single-instance OK).
 */
export function assertAIRateLimit(userId: string): void {
  const perMin = getAIPerMinuteLimit();
  const daily = getAIDailyRequestLimit();

  if (!checkRateLimit(`ai:min:${userId}`, perMin, 60_000)) {
    throw new AIError(
      "RATE_LIMITED",
      "Terlalu banyak permintaan AI. Tunggu sebentar lalu coba lagi.",
      429
    );
  }

  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  if (!checkRateLimit(`ai:day:${userId}:${dayKey}`, daily, 86_400_000)) {
    throw new AIError(
      "RATE_LIMITED",
      "Batas permintaan AI harian tercapai. Coba lagi besok.",
      429
    );
  }
}

/** @deprecated use assertAIRateLimit */
export function checkAIRateLimit(
  userId: string,
  limit = 10,
  windowMs = 60_000
): boolean {
  return checkRateLimit(`ai:${userId}`, limit, windowMs);
}

export { FINANCIAL_EXPLAINER_SYSTEM as FINANCIAL_AI_SYSTEM } from "@/lib/ai/system-prompt";
