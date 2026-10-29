/**
 * Phase 5 AI config — OpenRouter Free only, no paid fallback.
 */

import { resolveFreeChatModel } from "@/lib/ai/model-guard";

export function getOpenRouterApiKey(): string {
  return (process.env.OPENROUTER_API_KEY ?? "").trim();
}

export function isAIConfigured(): boolean {
  return getOpenRouterApiKey().length > 0;
}

/**
 * Pin to a free *chat/instruct* model.
 * Avoid bare `openrouter/free` — it can route to content-safety classifiers.
 */
export function getOpenRouterModel(): string {
  const configured = (process.env.OPENROUTER_MODEL ?? "").trim();
  return resolveFreeChatModel(
    configured || "nvidia/nemotron-3.5-lightning:free"
  );
}

export function getAIMaxOutputTokens(): number {
  // 1200 default: Lightning free often spends tokens on hidden reasoning first
  const n = Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS ?? 1200);
  if (!Number.isFinite(n) || n < 64) return 1200;
  return Math.min(2000, Math.floor(n));
}

export function getAIRequestTimeoutMs(): number {
  const n = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 20_000);
  if (!Number.isFinite(n) || n < 3000) return 20_000;
  return Math.min(60_000, Math.floor(n));
}

export function getAIDailyRequestLimit(): number {
  const n = Number(process.env.AI_DAILY_REQUEST_LIMIT ?? 20);
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(200, Math.floor(n));
}

export function getAIPerMinuteLimit(): number {
  const n = Number(process.env.AI_PER_MINUTE_LIMIT ?? 3);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(30, Math.floor(n));
}
