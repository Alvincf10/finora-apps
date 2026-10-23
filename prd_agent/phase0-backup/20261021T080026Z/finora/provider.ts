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
          max_tokens: input.maxTokens ?? 500,
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
    };

    return {
      text: json.choices?.[0]?.message?.content ?? "",
      model: json.model ?? this.model,
      provider: "openrouter",
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
