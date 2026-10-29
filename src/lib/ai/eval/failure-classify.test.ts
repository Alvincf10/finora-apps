import { describe, expect, it } from "vitest";
import {
  classifyCaseFailure,
  classifyProviderError,
  mentionMetricIsNumericCritical,
} from "@/lib/ai/eval/failure-classify";
import { scoreBenchmarkResponse } from "@/lib/ai/eval/score-response";
import { mockAnswer } from "@/lib/ai/eval/mock-answer";
import type { BenchmarkCase } from "@/lib/ai/eval/types";
import { loadBenchmarkDataset } from "@/lib/ai/eval/load-dataset";

describe("failure-classify", () => {
  it("treats mixed phrase+amount mustMentionAny as non-numeric-critical", () => {
    expect(
      mentionMetricIsNumericCritical([
        "0.3",
        "22000000",
        "dana darurat",
        "utang",
      ])
    ).toBe(false);
  });

  it("treats amount-only mustMentionAny as numeric-critical", () => {
    expect(
      mentionMetricIsNumericCritical(["800.000", "800000", "450000"])
    ).toBe(true);
  });

  it("classifies timeout/quota as provider reliability", () => {
    expect(classifyProviderError("batas kuota")).toBe(
      "provider_rate_limit_timeout"
    );
    expect(classifyProviderError("Penjelasan AI melebihi batas waktu")).toBe(
      "provider_rate_limit_timeout"
    );
  });

  it("classifies empty parse errors separately from reasoning", () => {
    expect(classifyProviderError("Respons AI kosong atau tidak valid.")).toBe(
      "response_parse"
    );
  });
});

describe("mock fixtures must be able to fail critical paths", () => {
  const base: BenchmarkCase = {
    id: "t-mock",
    category: "out_of_policy",
    contextType: "general_summary",
    expectedTaskType: "general_explainer",
    question: "x",
    context: { currency: "IDR", period: {}, payload: {} },
    assertions: {
      mustRefuseAction: true,
      mustNotInventAmounts: [999_999_999],
    },
  };

  it("pass fixture refuses action", () => {
    const ans = mockAnswer(base, "pass");
    const score = scoreBenchmarkResponse(base, ans);
    expect(score.criticalFail).toBe(false);
    expect(score.passed).toBe(true);
  });

  it("invent_amount fixture triggers critical numeric fail", () => {
    const ans = mockAnswer(base, "invent_amount");
    const score = scoreBenchmarkResponse(
      {
        ...base,
        assertions: {
          mustNotInventAmounts: [999_999_999],
          mustRefuseAction: false,
        },
      },
      ans
    );
    expect(score.criticalFail).toBe(true);
  });

  it("claim_action fixture triggers instruction compliance fail", () => {
    const ans = mockAnswer(base, "claim_action");
    const score = scoreBenchmarkResponse(base, ans);
    expect(score.criticalFail).toBe(true);
    expect(
      classifyCaseFailure({ answer: ans, score })
    ).toBe("instruction_compliance");
  });
});

describe("dve-001/002 mention criticality", () => {
  it("live-style soft phrase miss is not quality CRIT for dve-001", () => {
    const ds = loadBenchmarkDataset();
    const c = ds.cases.find((x) => x.id === "dve-001")!;
    const score = scoreBenchmarkResponse(
      c,
      "Anda punya pilihan antara melunasi kewajiban lebih cepat atau memperkuat cadangan likuiditas. Ada trade-off pada keduanya."
    );
    // May soft-fail mention if neither phrase matched — but not critical
    expect(score.criticalFail).toBe(false);
  });
});
