import { describe, expect, it } from "vitest";
import {
  buildWeeklyCutAdvice,
  buildWeeklyEnvelopeAdvice,
  formatWeeklyReportWaText,
  suggestWeeklyEnvelopeBudget,
  type WeeklyReview,
} from "./weekly-review";

describe("buildWeeklyCutAdvice", () => {
  it("suggests a concrete next-week target from the WoW excess", () => {
    const message = buildWeeklyCutAdvice({
      categoryName: "Food",
      weekAmount: 707_100,
      prevWeekAmount: 197_000,
      topItems: [
        { label: "kopi nako bogor", amount: 114_600 },
        { label: "makan malem kimatsu", amount: 96_000 },
        { label: "makan siang", amount: 60_000 },
      ],
      currency: "IDR",
    });

    expect(message).toContain("Food");
    expect(message).toContain("target minggu depan");
    expect(message).toContain("kopi nako bogor");
    expect(message).toContain("makan malem kimatsu");
    expect(message).not.toContain("potong hepi dulu sebelum fixed");
  });

  it("ignores fixed-cost lines when naming cut focus", () => {
    const message = buildWeeklyCutAdvice({
      categoryName: "Shopping",
      weekAmount: 419_600,
      prevWeekAmount: 100_000,
      topItems: [
        { label: "Fixed cost: cursor", amount: 360_000 },
        { label: "beli baju running", amount: 115_000 },
      ],
      currency: "IDR",
    });

    expect(message).toContain("beli baju running");
    expect(message).not.toContain("Fixed cost: cursor");
  });
});

describe("suggestWeeklyEnvelopeBudget", () => {
  it("sets Food / Entertainment / Relationship envelopes from recent weeks", () => {
    expect(
      suggestWeeklyEnvelopeBudget({
        categoryName: "Food",
        weekAmounts: [821_000, 244_200, 701_100],
      })
    ).toBe(400_000);
    expect(
      suggestWeeklyEnvelopeBudget({
        categoryName: "Entertainment",
        weekAmounts: [472_500, 515_000, 220_000],
      })
    ).toBe(225_000);
    expect(
      suggestWeeklyEnvelopeBudget({
        categoryName: "Relationship",
        weekAmounts: [0, 0, 161_300],
      })
    ).toBe(150_000);
  });

  it("formats envelope advice with daily pace", () => {
    const msg = buildWeeklyEnvelopeAdvice({
      categoryName: "Food",
      displayName: "Makan (Food)",
      weekAmount: 701_100,
      weekAmounts: [821_000, 244_200, 701_100],
      currency: "IDR",
    }).message;
    expect(msg).toContain("budget minggu depan");
    expect(msg).toContain("/hari");
  });
});

describe("formatWeeklyReportWaText tags", () => {
  it("labels week-over-week spikes as naik, not wow", () => {
    const review: WeeklyReview = {
      offset: 0,
      label: "26/10–01/11/2026",
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      expenses: 3_224_000,
      prevExpenses: 8_000_000,
      expenseChangePercent: -61,
      topCategories: [],
      overCategories: [
        {
          categoryId: "1",
          categoryName: "Food",
          weekAmount: 707_100,
          prevWeekAmount: 197_000,
          wowChangePercent: 259,
          budgetAmount: null,
          weeklyAllotment: null,
          paceUtilization: null,
          signals: ["WOW"],
          classification: "DISCRETIONARY",
          nature: "VARIABLE",
          cuttable: true,
          topItems: [{ label: "kopi nako bogor", amount: 114_600 }],
        },
      ],
      advice: [],
      currency: "IDR",
      daysLeftInMonth: 20,
    };

    const text = formatWeeklyReportWaText(review);
    expect(text).toContain("[naik]");
    expect(text).not.toContain("[wow]");
  });
});
