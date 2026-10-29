import { describe, expect, it } from "vitest";
import {
  collectAllowedAmounts,
  validateAiExplanation,
} from "@/lib/ai/response-validator";

describe("response-validator", () => {
  it("collects amounts from nested payload", () => {
    const amounts = collectAllowedAmounts({
      scenario: {
        results: { endingBalance: 4_500_000, cashFlow: 1_000_000 },
        baseline: { income: 12_000_000 },
      },
    });
    expect(amounts).toEqual(
      expect.arrayContaining([4_500_000, 1_000_000, 12_000_000])
    );
  });

  it("flags executed-action claims", () => {
    const v = validateAiExplanation(
      "Sudah saya transfer ke rekening tabungan.",
      { endingBalance: 1_000_000 }
    );
    expect(v.ok).toBe(false);
    expect(v.warnings.length).toBeGreaterThan(0);
  });

  it("flags canary invented amounts", () => {
    const v = validateAiExplanation("Saldo rahasia 99999999", {
      endingBalance: 1_000_000,
    });
    expect(v.ok).toBe(false);
  });

  it("passes clean Indonesian explanation", () => {
    const v = validateAiExplanation(
      "Kesimpulan: ending balance Rp 4.500.000 lebih tinggi dari baseline. Trade-off: kas lebih ketat.",
      { results: { endingBalance: 4_500_000 } }
    );
    expect(v.ok).toBe(true);
    expect(v.cleanedExplanation).toContain("Kesimpulan");
  });
});
