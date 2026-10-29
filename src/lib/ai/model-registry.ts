/**
 * Central Free Model Registry (PRD Phase 5.1 §5–6).
 * Router never invents model IDs — only verified / allowlisted free models.
 */

import {
  FREE_CHAT_MODEL_FALLBACKS,
  isSafetyClassifierModel,
  resolveFreeChatModel,
} from "@/lib/ai/model-guard";
import { getOpenRouterModel } from "@/lib/ai/config";
import type { AiTaskType } from "@/lib/ai/task-types";
import { AIError } from "@/lib/ai/errors";

export const MODEL_REGISTRY_VERSION = "phase5.1-b-1";

export type ModelRouteConfig = {
  primaryModel: string;
  fallbackModels: string[];
  maxOutputTokens: number;
  timeoutMs: number;
};

/** Known free chat models allowed even if suffix parsing is ambiguous. */
const FREE_ALLOWLIST = new Set<string>([
  ...FREE_CHAT_MODEL_FALLBACKS,
  "openrouter/free", // rewritten by resolveFreeChatModel — never sent raw when resolved
]);

/**
 * Free-route compliance: require `:free` suffix OR allowlist entry.
 * Rejects safety classifiers and anything that looks paid/unverified.
 */
export function isAllowedFreeModel(modelId: string): boolean {
  const id = modelId.trim();
  if (!id) return false;
  if (isSafetyClassifierModel(id)) return false;
  if (FREE_ALLOWLIST.has(id)) return true;
  // OpenRouter free SKUs end with :free
  if (/:free$/i.test(id)) return true;
  return false;
}

export function assertAllowedFreeModel(modelId: string): string {
  const resolved = resolveFreeChatModel(modelId);
  if (!isAllowedFreeModel(resolved) && !isAllowedFreeModel(modelId)) {
    throw new AIError(
      "AI_NOT_CONFIGURED",
      "Konfigurasi model AI tidak valid (hanya model gratis yang diizinkan).",
      503
    );
  }
  // Prefer resolved chat pin when input was openrouter/free or safety
  if (!isAllowedFreeModel(resolved)) {
    throw new AIError(
      "AI_NOT_CONFIGURED",
      "Konfigurasi model AI tidak valid (hanya model gratis yang diizinkan).",
      503
    );
  }
  return resolved;
}

export function parseFallbackModelsCsv(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    if (!isAllowedFreeModel(id) && !isAllowedFreeModel(resolveFreeChatModel(id))) {
      // Skip unpaid / unverified — never promote to route
      continue;
    }
    const resolved = resolveFreeChatModel(id);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

export function isAiRouterEnabled(): boolean {
  const v = (process.env.AI_ROUTER_ENABLED ?? "false").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Max fallback attempts after primary (baseline PRD: 1). */
export function getAiMaxRetries(): number {
  const n = Number(process.env.AI_MAX_RETRIES ?? 1);
  if (!Number.isFinite(n) || n < 0) return 1;
  return Math.min(2, Math.floor(n));
}

function envModelForTask(task: AiTaskType): string | undefined {
  const map: Record<AiTaskType, string | undefined> = {
    simple_summary: process.env.OPENROUTER_MODEL_SIMPLE_SUMMARY,
    financial_explainer: process.env.OPENROUTER_MODEL_FINANCIAL_EXPLAINER,
    financial_reasoning: process.env.OPENROUTER_MODEL_FINANCIAL_REASONING,
    action_advisor: process.env.OPENROUTER_MODEL_ACTION_ADVISOR,
    general_explainer:
      process.env.OPENROUTER_MODEL_FINANCIAL_EXPLAINER ??
      process.env.OPENROUTER_MODEL,
  };
  const raw = map[task]?.trim();
  return raw || undefined;
}

function defaultMaxTokens(): number {
  const n = Number(
    process.env.AI_MAX_OUTPUT_TOKENS ??
      process.env.OPENROUTER_MAX_OUTPUT_TOKENS ??
      800
  );
  if (!Number.isFinite(n) || n < 64) return 800;
  return Math.min(2000, Math.floor(n));
}

function defaultTimeoutMs(): number {
  const n = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 20_000);
  if (!Number.isFinite(n) || n < 3000) return 20_000;
  return Math.min(60_000, Math.floor(n));
}

/**
 * Resolve route for a task. Always returns free-only models.
 * Empty per-task env → Phase 5 baseline `OPENROUTER_MODEL`.
 */
export function getRouteForTask(task: AiTaskType): ModelRouteConfig {
  const baseline = getOpenRouterModel();
  let primary: string;
  try {
    primary = assertAllowedFreeModel(envModelForTask(task) ?? baseline);
  } catch {
    // Safe degrade: Phase 5 baseline free pin — never paid
    primary = assertAllowedFreeModel(baseline);
  }

  const fromEnv = parseFallbackModelsCsv(process.env.OPENROUTER_FALLBACK_MODELS);
  const fromGuard = FREE_CHAT_MODEL_FALLBACKS.filter(
    (m) => m !== primary && isAllowedFreeModel(m)
  );
  const fallbackModels: string[] = [];
  const seen = new Set<string>([primary]);
  for (const m of [...fromEnv, ...fromGuard]) {
    if (seen.has(m)) continue;
    if (!isAllowedFreeModel(m)) continue;
    seen.add(m);
    fallbackModels.push(m);
  }

  // Cap stored fallbacks; router applies AI_MAX_RETRIES at runtime
  return {
    primaryModel: primary,
    fallbackModels: fallbackModels.slice(0, 3),
    maxOutputTokens: defaultMaxTokens(),
    timeoutMs: defaultTimeoutMs(),
  };
}
