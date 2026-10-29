import type { CaseScore, MetricScore } from "@/lib/ai/eval/types";

/**
 * Separate provider/reliability failures from model-quality failures (PRD 5.2).
 */
export type FailureCategory =
  | "none"
  | "numeric_or_factual"
  | "instruction_compliance"
  | "invalid_or_empty_output"
  | "provider_rate_limit_timeout"
  | "provider_other"
  | "response_parse"
  | "harness_assertion"
  | "soft_quality";

export function classifyProviderError(message: string): FailureCategory {
  const m = message.toLowerCase();
  if (
    /timeout|melebihi batas waktu|aborted|504/.test(m) ||
    /rate.?limit|kuota|429|unavailable|503/.test(m)
  ) {
    return "provider_rate_limit_timeout";
  }
  if (/kosong|tidak valid|response_invalid|502|safety classifier/.test(m)) {
    return "response_parse";
  }
  return "provider_other";
}

function isAmountLikeNeedle(needle: string): boolean {
  return /[\d]/.test(needle) && !/^[a-zA-Z\s]+$/.test(needle);
}

/**
 * mustMentionAny mixes amounts and soft phrases; only amount needles are
 * numeric-integrity-critical. Phrase-only misses are factual / harness soft.
 */
export function mentionMetricIsNumericCritical(needles: string[]): boolean {
  return needles.length > 0 && needles.every(isAmountLikeNeedle);
}

export function classifyQualityScore(score: CaseScore): FailureCategory {
  if (score.passed) return "none";
  const failed = score.metrics.filter((m) => !m.pass);
  if (!failed.length) return "soft_quality";

  const has = (pred: (m: MetricScore) => boolean) => failed.some(pred);

  if (
    has(
      (m) =>
        m.key === "non_empty" ||
        (m.key === "numeric_integrity_mention" &&
          /Missing required/.test(m.detail) &&
          score.metrics.every(
            (x) => x.key !== "numeric_integrity_mention" || !x.pass
          ))
    ) &&
    !score.metrics.some((m) => m.key === "numeric_integrity_mention" && m.pass)
  ) {
    // Empty / whitespace-only answers
    if (
      has((m) => m.key === "non_empty") ||
      failed.every((m) => m.key === "numeric_integrity_mention")
    ) {
      /* fall through — mention miss on empty is invalid_or_empty if answer blank handled upstream */
    }
  }

  if (has((m) => m.key === "instruction_compliance")) {
    return "instruction_compliance";
  }
  if (
    has(
      (m) =>
        m.key === "numeric_integrity_no_invent" ||
        m.key === "no_guarantee" ||
        m.key === "no_bankruptcy_overclaim" ||
        m.key === "forbidden_phrase"
    )
  ) {
    return "numeric_or_factual";
  }
  if (has((m) => m.key === "numeric_integrity_mention" && m.critical)) {
    return "numeric_or_factual";
  }
  if (has((m) => m.key === "numeric_integrity_mention" && !m.critical)) {
    return "harness_assertion";
  }
  if (has((m) => m.key === "non_empty")) {
    return "invalid_or_empty_output";
  }
  return "soft_quality";
}

export function classifyCaseFailure(input: {
  providerError?: string;
  answer: string;
  score: CaseScore;
}): FailureCategory {
  if (input.providerError) {
    return classifyProviderError(input.providerError);
  }
  if (!input.answer.trim()) {
    return "invalid_or_empty_output";
  }
  return classifyQualityScore(input.score);
}
