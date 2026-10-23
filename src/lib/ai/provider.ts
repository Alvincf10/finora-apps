import { appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
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
  estimatedCostUsd?: number;
}

const FINORA_LEDGER =
  process.env.FINORA_COST_LEDGER_PATH ?? "/var/lib/openclaw-cost/ledger.jsonl";

/** GPT-4o-mini-ish defaults; override via env later if needed. */
const DEFAULT_PRICE = { input: 0.15, output: 0.6 };

function appendFinoraCost(entry: Record<string, unknown>) {
  try {
    const dir = dirname(FINORA_LEDGER);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(FINORA_LEDGER, `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch {
    // Never fail the user-facing AI call because of ledger I/O
  }
}

export interface AIProvider {
  generateText(input: AIRequest): Promise<AIResponse>;
}

export class OpenRouterProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private siteUrl?: string;
  private appName?: string;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY ?? "";
    this.model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
    this.siteUrl = process.env.OPENROUTER_SITE_URL;
    this.appName = process.env.OPENROUTER_APP_NAME;
  }

  async generateText(input: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.siteUrl) headers["HTTP-Referer"] = this.siteUrl;
    if (this.appName) headers["X-Title"] = this.appName;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.prompt },
          ],
          max_tokens: input.maxTokens ?? 400,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter error: ${response.status} ${body}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;
    const estimatedCostUsd =
      Math.round(
        ((inputTokens * DEFAULT_PRICE.input +
          outputTokens * DEFAULT_PRICE.output) /
          1_000_000) *
          1e8
      ) / 1e8;

    const model = json.model ?? this.model;
    appendFinoraCost({
      request_id: null,
      agent_name: "finora",
      task_type: "ai_explain",
      provider: "openrouter",
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimatedCostUsd,
      status: "ok",
      ts: new Date().toISOString(),
      month_key: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
      })
        .format(new Date())
        .slice(0, 7),
    });

    return {
      text: json.choices?.[0]?.message?.content ?? "",
      model,
      provider: "openrouter",
      inputTokens,
      outputTokens,
      estimatedCostUsd,
    };
  }
}

export function getAIProvider(): AIProvider {
  return new OpenRouterProvider();
}

export function checkAIRateLimit(
  userId: string,
  limit = 10,
  windowMs = 60_000
): boolean {
  return checkRateLimit(`ai:${userId}`, limit, windowMs);
}

export const FINANCIAL_AI_SYSTEM = `You explain personal finance metrics based ONLY on the structured JSON context provided.
Rules:
- Never invent transactions, balances, interest rates, or exchange rates.
- Never suggest executing financial actions automatically.
- You are not the source of truth; the backend numbers are.
- Keep explanations concise and practical.
- If data is missing, say so clearly.`;
