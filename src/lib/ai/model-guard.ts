/**
 * Guardrails so OpenRouter Free never lands on classifier/safety models
 * (e.g. nvidia/nemotron-3.5-content-safety:free → "User Safety: safe").
 */

const SAFETY_MODEL_RE =
  /content-safety|moderation|prompt-guard|llama-guard|safety-check|content-filter/i;

const SAFETY_OUTPUT_RE =
  /^\s*user\s*safety\s*:\s*(safe|unsafe|blocked)\s*$/i;

/**
 * Preferred free chat models (no paid fallback).
 * Lightning first — Gemma free pool is often upstream rate-limited.
 */
export const FREE_CHAT_MODEL_FALLBACKS = [
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
] as const;

export function isSafetyClassifierModel(modelId: string): boolean {
  return SAFETY_MODEL_RE.test(modelId);
}

export function looksLikeSafetyOnlyOutput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (SAFETY_OUTPUT_RE.test(trimmed)) return true;
  if (
    trimmed.length < 80 &&
    /^(safe|unsafe|blocked|allow|deny)\b/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

/**
 * If env still points at openrouter/free (random router) or a safety model,
 * pin to a concrete free instruct model.
 */
export function resolveFreeChatModel(configured: string): string {
  const model = configured.trim();
  if (!model || model === "openrouter/free" || isSafetyClassifierModel(model)) {
    return FREE_CHAT_MODEL_FALLBACKS[0];
  }
  return model;
}

export function freeChatFallbackModels(primary: string): string[] {
  const ordered = [primary, ...FREE_CHAT_MODEL_FALLBACKS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ordered) {
    if (!id || isSafetyClassifierModel(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
