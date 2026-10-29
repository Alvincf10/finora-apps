import type { AIContextType } from "@/lib/ai/context-builder";
import type { AiTaskType } from "@/lib/ai/task-types";

/** PRD Phase 5.2 §6.3 + 5.2-G preference adherence */
export const BENCHMARK_CATEGORIES = [
  "debt_vs_emergency",
  "cashflow_liquidity",
  "scenario_compare",
  "budget_priority",
  "roadmap_savings",
  "incomplete_data",
  "out_of_policy",
  "decision_preference",
] as const;

export type BenchmarkCategory = (typeof BENCHMARK_CATEGORIES)[number];

export type BenchmarkAssertions = {
  /** At least one of these substrings should appear (normalized OK). */
  mustMentionAny?: string[];
  /** Raw integer amounts that must NOT appear in the answer. */
  mustNotInventAmounts?: number[];
  /** Allowed engine amounts — used for optional soft checks. */
  allowedAmounts?: number[];
  mustRefuseAction?: boolean;
  mustDiscussTradeOff?: boolean;
  mustAcknowledgeLimitation?: boolean;
  mustPrioritizeCriticalFirst?: boolean;
  mustNotClaimGuaranteedOutcome?: boolean;
  mustNotInventFxConversion?: boolean;
  mustNotOverclaimBankruptcy?: boolean;
  mustNotClaimShortfall?: boolean;
  preferShortAnswer?: boolean;
  maxSuggestedSentences?: number;
  /** Extra forbidden phrases (case-insensitive). */
  mustNotContainAny?: string[];
  /** Extra required phrases (any). */
  mustContainAny?: string[];
};

export type BenchmarkCase = {
  id: string;
  category: BenchmarkCategory;
  contextType: AIContextType;
  expectedTaskType: AiTaskType;
  question: string;
  context: {
    currency: string;
    period: Record<string, unknown>;
    dataLimitations?: string[];
    payload: Record<string, unknown>;
  };
  /** Engine-grounded facts the model may restate */
  requiredFacts?: string[];
  /** Conclusions that are unsupported / forbidden */
  forbiddenConclusions?: string[];
  assertions: BenchmarkAssertions;
};

export type BenchmarkDataset = {
  version: string;
  createdAt: string;
  currencyUnit: string;
  notes: string[];
  targetDistribution: Record<BenchmarkCategory, number>;
  rubric: Record<string, string>;
  cases: BenchmarkCase[];
};

export type MetricScore = {
  key: string;
  pass: boolean;
  critical: boolean;
  detail: string;
};

export type CaseScore = {
  caseId: string;
  category: BenchmarkCategory;
  passed: boolean;
  criticalFail: boolean;
  metrics: MetricScore[];
  notes: string[];
};
