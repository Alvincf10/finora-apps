import {
  getAIMaxOutputTokens,
  getAIRequestTimeoutMs,
  getOpenRouterApiKey,
  getOpenRouterModel,
  isAIConfigured,
} from "@/lib/ai/config";
import { AIError } from "@/lib/ai/errors";
import {
  checkRateLimit,
} from "@/lib/rate-limit";
import {
  getAIDailyRequestLimit,
  getAIPerMinuteLimit,
} from "@/lib/ai/config";

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
}

type OpenRouterChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
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

  async generateText(input: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new AIError(
        "AI_NOT_CONFIGURED",
        "Layanan penjelasan AI belum dikonfigurasi.",
        503
      );
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.siteUrl) headers["HTTP-Referer"] = this.siteUrl;
    if (this.appName) headers["X-Title"] = this.appName;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.prompt },
          ],
          max_tokens: input.maxTokens ?? this.maxTokensDefault,
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
      // Never surface provider body (may contain keys / internals)
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

    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      throw new AIError(
        "AI_RESPONSE_INVALID",
        "Respons AI kosong atau tidak valid.",
        502
      );
    }

    return {
      text,
      model: json.model ?? this.model,
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
