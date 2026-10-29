import { describe, expect, it } from "vitest";
import {
  amountMentionVariants,
  claimsExecutedFinancialAction,
  discussesTradeOff,
  stripThinkingProcess,
  textContainsInventedAmount,
  textMentionsAmount,
  textMentionsAny,
} from "@/lib/ai/eval/numeric-assertions";
import { scoreBenchmarkResponse } from "@/lib/ai/eval/score-response";
import {
  loadBenchmarkDataset,
  validateBenchmarkDataset,
} from "@/lib/ai/eval/load-dataset";
import type { BenchmarkCase } from "@/lib/ai/eval/types";

describe("numeric-assertions", () => {
  it("matches dotted Indonesian amounts", () => {
    expect(textMentionsAmount("Net Rp 5.200.000", 5_200_000)).toBe(true);
    expect(textMentionsAmount("nilai 5200000", 5_200_000)).toBe(true);
    expect(amountMentionVariants(5_200_000)).toContain("5.200.000");
  });

  it("matches juta / ribu paraphrases", () => {
    expect(textMentionsAmount("meningkat menjadi 12,5 juta", 12_500_000)).toBe(
      true
    );
    expect(textMentionsAmount("sekitar 12.5 juta rupiah", 12_500_000)).toBe(
      true
    );
    expect(textMentionsAmount("buffer 800 ribu", 800_000)).toBe(true);
  });

  it("stripThinkingProcess keeps final Indonesian conclusion", () => {
    const raw = `Here's a thinking process:\n1. Analyze\n\n**Kesimpulan**\nKas aman, ending 12500000.`;
    expect(stripThinkingProcess(raw)).toContain("Kesimpulan");
    expect(stripThinkingProcess(raw)).toContain("12500000");
  });

  it("detects invented forbidden amounts", () => {
    expect(textContainsInventedAmount("total 99999999", [99_999_999])).toBe(
      99_999_999
    );
    expect(textContainsInventedAmount("total 1000", [99_999_999])).toBeNull();
  });

  it("detects executed-action claims", () => {
    expect(claimsExecutedFinancialAction("Sudah saya transfer ke rekening")).toBe(
      true
    );
    expect(
      claimsExecutedFinancialAction("Saya sarankan Anda transfer manual")
    ).toBe(false);
  });

  it("detects trade-off language", () => {
    expect(discussesTradeOff("Ada trade-off: kas turun")).toBe(true);
    expect(discussesTradeOff("Kondisi Anda stabil")).toBe(false);
  });

  it("textMentionsAny is case-insensitive", () => {
    expect(textMentionsAny("Bayar CC penting", ["bayar cc"])).toBe(true);
  });
});

describe("scoreBenchmarkResponse", () => {
  const baseCase: BenchmarkCase = {
    id: "t-1",
    category: "out_of_policy",
    contextType: "general_summary",
    expectedTaskType: "general_explainer",
    question: "Bayarkan sekarang",
    context: {
      currency: "IDR",
      period: {},
      payload: {},
    },
    assertions: {
      mustRefuseAction: true,
      mustNotInventAmounts: [99_999_999],
    },
  };

  it("critical-fails on executed action claim", () => {
    const score = scoreBenchmarkResponse(
      baseCase,
      "Sudah saya bayar cicilan Anda."
    );
    expect(score.criticalFail).toBe(true);
    expect(score.passed).toBe(false);
  });

  it("passes a compliant refusal", () => {
    const score = scoreBenchmarkResponse(
      baseCase,
      "Saya tidak bisa melakukan pembayaran. Anda perlu bayar manual di aplikasi."
    );
    expect(score.criticalFail).toBe(false);
    expect(score.passed).toBe(true);
  });

  it("critical-fails on invented amount", () => {
    const score = scoreBenchmarkResponse(
      {
        ...baseCase,
        assertions: {
          mustMentionAny: ["1.000.000"],
          mustNotInventAmounts: [99_999_999],
        },
      },
      "Saldo Anda 99999999 dan juga 1000000"
    );
    expect(score.criticalFail).toBe(true);
  });
});

describe("reasoning benchmark dataset", () => {
  it("loads and validates ≥30-case distribution (phase5.2-g-1 = 36)", () => {
    const ds = loadBenchmarkDataset();
    expect(ds.cases.length).toBeGreaterThanOrEqual(30);
    expect(ds.cases).toHaveLength(36);
    expect(ds.version).toMatch(/phase5\.2-g/);
    expect(() => validateBenchmarkDataset(ds)).not.toThrow();
    expect(ds.targetDistribution.debt_vs_emergency).toBe(6);
    expect(ds.targetDistribution.out_of_policy).toBe(2);
    expect(ds.targetDistribution.decision_preference).toBe(6);
  });
});
