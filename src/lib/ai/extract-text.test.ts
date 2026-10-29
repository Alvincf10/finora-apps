import { describe, expect, it } from "vitest";
import { extractOpenRouterText } from "@/lib/ai/extract-text";

describe("extractOpenRouterText", () => {
  it("prefers content string", () => {
    expect(
      extractOpenRouterText({
        content: "Kesimpulan: cash flow ketat.",
        reasoning: "internal thoughts",
      })
    ).toBe("Kesimpulan: cash flow ketat.");
  });

  it("falls back to reasoning when content is null", () => {
    expect(
      extractOpenRouterText({
        content: null,
        reasoning: "Karena fixed cost tinggi di cycle ini.",
      })
    ).toBe("Karena fixed cost tinggi di cycle ini.");
  });

  it("falls back to reasoning_details text", () => {
    expect(
      extractOpenRouterText({
        content: "   ",
        reasoning_details: [
          { type: "reasoning.text", text: "Bagian A" },
          { type: "reasoning.text", text: "Bagian B" },
        ],
      })
    ).toBe("Bagian A\n\nBagian B");
  });

  it("returns empty when nothing usable", () => {
    expect(extractOpenRouterText({ content: null })).toBe("");
  });
});
