import { readFileSync } from "fs";
import { resolve } from "path";
import {
  BENCHMARK_CATEGORIES,
  type BenchmarkCategory,
  type BenchmarkDataset,
} from "@/lib/ai/eval/types";
import { AI_CONTEXT_TYPES } from "@/lib/ai/context-builder";
import { AI_TASK_TYPES } from "@/lib/ai/task-types";

export const DEFAULT_REASONING_DATASET_PATH = resolve(
  process.cwd(),
  "docs/ai-eval/reasoning-benchmark-v1.json"
);

export function loadBenchmarkDataset(
  path: string = DEFAULT_REASONING_DATASET_PATH
): BenchmarkDataset {
  const raw = JSON.parse(readFileSync(path, "utf8")) as BenchmarkDataset;
  validateBenchmarkDataset(raw);
  return raw;
}

export function validateBenchmarkDataset(dataset: BenchmarkDataset): void {
  if (!dataset.version || !Array.isArray(dataset.cases)) {
    throw new Error("Invalid dataset: missing version or cases");
  }
  if (dataset.cases.length < 30) {
    throw new Error(
      `Dataset must have ≥30 cases (got ${dataset.cases.length})`
    );
  }

  const seen = new Set<string>();
  const counts: Record<string, number> = {};

  for (const c of dataset.cases) {
    if (!c.id || seen.has(c.id)) {
      throw new Error(`Duplicate or empty case id: ${c.id}`);
    }
    seen.add(c.id);

    if (
      !BENCHMARK_CATEGORIES.includes(c.category as BenchmarkCategory)
    ) {
      throw new Error(`Unknown category ${c.category} on ${c.id}`);
    }
    counts[c.category] = (counts[c.category] ?? 0) + 1;

    if (!(AI_CONTEXT_TYPES as readonly string[]).includes(c.contextType)) {
      throw new Error(`Invalid contextType on ${c.id}`);
    }
    if (!(AI_TASK_TYPES as readonly string[]).includes(c.expectedTaskType)) {
      throw new Error(`Invalid expectedTaskType on ${c.id}`);
    }
    if (!c.question?.trim()) {
      throw new Error(`Empty question on ${c.id}`);
    }
    if (!c.context?.payload || typeof c.context.payload !== "object") {
      throw new Error(`Missing context.payload on ${c.id}`);
    }
    if (!c.assertions || typeof c.assertions !== "object") {
      throw new Error(`Missing assertions on ${c.id}`);
    }
  }

  if (dataset.targetDistribution) {
    for (const cat of BENCHMARK_CATEGORIES) {
      const want = dataset.targetDistribution[cat];
      const got = counts[cat] ?? 0;
      if (want != null && got !== want) {
        throw new Error(
          `Distribution mismatch for ${cat}: got ${got}, want ${want}`
        );
      }
    }
  }
}

export function buildEvalPrompt(benchmarkCase: {
  question: string;
  context: {
    currency: string;
    period: Record<string, unknown>;
    dataLimitations?: string[];
    payload: Record<string, unknown>;
  };
  contextType: string;
}): string {
  return [
    `Jenis konteks: ${benchmarkCase.contextType}`,
    `Mata uang: ${benchmarkCase.context.currency}`,
    `Periode: ${JSON.stringify(benchmarkCase.context.period)}`,
    benchmarkCase.context.dataLimitations?.length
      ? `Batasan data: ${benchmarkCase.context.dataLimitations.join(", ")}`
      : null,
    "Ringkasan finansial (sumber kebenaran Finora):",
    JSON.stringify(benchmarkCase.context.payload, null, 2),
    "",
    `Pertanyaan pengguna: ${benchmarkCase.question}`,
  ]
    .filter(Boolean)
    .join("\n");
}
