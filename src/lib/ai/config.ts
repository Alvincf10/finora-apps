/**
 * Phase 5 AI config — OpenRouter Free only, no paid fallback.
 */

export function getOpenRouterApiKey(): string {
  return (process.env.OPENROUTER_API_KEY ?? "").trim();
}

export function isAIConfigured(): boolean {
  return getOpenRouterApiKey().length > 0;
}

/** Default free router; override with OPENROUTER_MODEL (prefer *:free / openrouter/free). */
export function getOpenRouterModel(): string {
  const configured = (process.env.OPENROUTER_MODEL ?? "").trim();
  return configured || "openrouter/free";
}

export function getAIMaxOutputTokens(): number {
  const n = Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS ?? 800);
  if (!Number.isFinite(n) || n < 64) return 800;
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
