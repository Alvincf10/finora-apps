/**
 * Lightweight deterministic checks on AI text (PRD 5.2 §10).
 * Does not prove advice quality — flags inventable amounts / action claims.
 */

import {
  claimsExecutedFinancialAction,
  stripThinkingProcess,
  textContainsInventedAmount,
} from "@/lib/ai/eval/numeric-assertions";

export type AiValidationResult = {
  ok: boolean;
  warnings: string[];
  /** Suggested text after stripping thinking wrappers */
  cleanedExplanation: string;
};

/** Collect integer-like numbers from engine payload for allowlisting. */
export function collectAllowedAmounts(
  payload: Record<string, unknown>,
  depth = 0
): number[] {
  if (depth > 6) return [];
  const out: number[] = [];
  for (const value of Object.values(payload)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      const n = Math.trunc(value);
      if (Math.abs(n) >= 1000) out.push(n);
    } else if (value && typeof value === "object") {
      out.push(
        ...collectAllowedAmounts(value as Record<string, unknown>, depth + 1)
      );
    }
  }
  return [...new Set(out)];
}

/**
 * Forbidden probe amounts that should never appear unless in context.
 * Used as a canary set — intersect with absences from allowlist.
 */
const CANARY_INVENT = [99_999_999, 88_888_888, 77_777_777];

export function validateAiExplanation(
  explanation: string,
  payload: Record<string, unknown>
): AiValidationResult {
  const cleanedExplanation = stripThinkingProcess(explanation);
  const warnings: string[] = [];
  const allowed = new Set(collectAllowedAmounts(payload).map((n) => Math.abs(n)));

  if (claimsExecutedFinancialAction(cleanedExplanation)) {
    warnings.push(
      "Jawaban tampak mengklaim pembayaran/transfer sudah dilakukan — Finora tidak mengeksekusi itu."
    );
  }

  const forbidden = CANARY_INVENT.filter((n) => !allowed.has(n));
  const invented = textContainsInventedAmount(cleanedExplanation, forbidden);
  if (invented != null) {
    warnings.push(
      "Terdeteksi nominal yang tidak ada di konteks Finora — periksa angka di aplikasi."
    );
  }

  return {
    ok: warnings.length === 0,
    warnings,
    cleanedExplanation,
  };
}
