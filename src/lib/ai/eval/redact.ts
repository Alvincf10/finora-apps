/**
 * Redact sensitive material before writing benchmark artifacts / logs.
 * Never store API keys or obvious credential patterns.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-or-v1-[a-zA-Z0-9_-]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._\-]+/gi,
  /OPENROUTER_API_KEY\s*=\s*\S+/gi,
  /api[_-]?key["']?\s*[:=]\s*["']?[^"'\\s]+/gi,
];

export function redactSecrets(text: string, maxLen = 4000): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  if (out.length > maxLen) {
    out = `${out.slice(0, maxLen)}…[truncated]`;
  }
  return out;
}

/** Status payload must never include key-like fields. */
export function assertSafeAiStatusPayload(payload: Record<string, unknown>): void {
  const banned = ["apiKey", "api_key", "OPENROUTER_API_KEY", "password", "token"];
  const json = JSON.stringify(payload);
  for (const b of banned) {
    if (new RegExp(`"${b}"\\s*:`, "i").test(json)) {
      throw new Error(`Unsafe status field leaked: ${b}`);
    }
  }
  if (/sk-or-v1-/i.test(json)) {
    throw new Error("API key material leaked in status payload");
  }
}
