import { describe, expect, it } from "vitest";
import { LADDER_STARTER_GOAL_NAME } from "@/lib/financial/wealth-ladder-math";
import {
  buildIncomeSaveSuggestion,
  INCOME_SAVE_SUGGEST_RATE,
} from "@/lib/financial/income-save-suggest";

function goal(
  id: string,
  name: string,
  opts: {
    currentAmount?: number;
    targetAmount?: number;
    goalType?: string;
  } = {}
) {
  return {
    _id: { toString: () => id },
    name,
    currentAmount: opts.currentAmount ?? 0,
    targetAmount: opts.targetAmount ?? 10_000_000,
    goalType: opts.goalType,
  };
}

describe("buildIncomeSaveSuggestion", () => {
  const basic = goal("basic-1", LADDER_STARTER_GOAL_NAME, {
    goalType: "BASIC_SAVINGS",
    currentAmount: 2_000_000,
    targetAmount: 10_000_000,
  });

  it("suggests 50% of freelance income toward priority goal", () => {
    const tip = buildIncomeSaveSuggestion({
      type: "INCOME",
      amount: 2_000_000,
      currency: "IDR",
      categoryName: "Freelance",
      goals: [basic],
    });
    expect(tip).toEqual({
      suggestAmount: 1_000_000,
      rate: INCOME_SAVE_SUGGEST_RATE,
      goalId: "basic-1",
      goalName: LADDER_STARTER_GOAL_NAME,
      currency: "IDR",
    });
  });

  it("caps suggestion at remaining goal gap", () => {
    const almostFull = goal("basic-1", LADDER_STARTER_GOAL_NAME, {
      goalType: "BASIC_SAVINGS",
      currentAmount: 9_700_000,
      targetAmount: 10_000_000,
    });
    const tip = buildIncomeSaveSuggestion({
      type: "INCOME",
      amount: 2_000_000,
      currency: "IDR",
      categoryName: "Freelance",
      goals: [almostFull],
    });
    expect(tip?.suggestAmount).toBe(300_000);
  });

  it("skips Salary income", () => {
    expect(
      buildIncomeSaveSuggestion({
        type: "INCOME",
        amount: 10_000_000,
        currency: "IDR",
        categoryName: "Salary",
        goals: [basic],
      })
    ).toBeNull();
  });

  it("skips EXPENSE and TRANSFER", () => {
    expect(
      buildIncomeSaveSuggestion({
        type: "EXPENSE",
        amount: 2_000_000,
        currency: "IDR",
        categoryName: "Freelance",
        goals: [basic],
      })
    ).toBeNull();
    expect(
      buildIncomeSaveSuggestion({
        type: "TRANSFER",
        amount: 2_000_000,
        currency: "IDR",
        categoryName: "Freelance",
        goals: [basic],
      })
    ).toBeNull();
  });

  it("returns null when no goal has a gap", () => {
    const full = goal("basic-1", LADDER_STARTER_GOAL_NAME, {
      goalType: "BASIC_SAVINGS",
      currentAmount: 10_000_000,
      targetAmount: 10_000_000,
    });
    expect(
      buildIncomeSaveSuggestion({
        type: "INCOME",
        amount: 2_000_000,
        currency: "IDR",
        categoryName: "Other Income",
        goals: [full],
      })
    ).toBeNull();
  });

  it("prefers Basic tabungan over other goals", () => {
    const other = goal("other-1", "Liburan", {
      currentAmount: 0,
      targetAmount: 500_000,
    });
    const tip = buildIncomeSaveSuggestion({
      type: "INCOME",
      amount: 1_000_000,
      currency: "IDR",
      categoryName: "Other Income",
      goals: [other, basic],
    });
    expect(tip?.goalId).toBe("basic-1");
    expect(tip?.goalName).toBe(LADDER_STARTER_GOAL_NAME);
  });
});
