import { describe, expect, it } from "vitest";
import {
  parseIdrAmount,
  parseMoneyMessage,
  stripAccountHint,
} from "./parse-expense";
import { parseTotalsQuery } from "./query-totals";

describe("stripAccountHint", () => {
  it("detects trailing cc / debit aliases", () => {
    expect(stripAccountHint("beli recheese 50rb cc")).toEqual({
      body: "beli recheese 50rb",
      hint: "cc",
    });
    expect(stripAccountHint("beli recheese 50rb debit")).toEqual({
      body: "beli recheese 50rb",
      hint: "debit",
    });
    expect(stripAccountHint("kopi 35k credit").hint).toBe("cc");
    expect(stripAccountHint("kopi 35k db").hint).toBe("debit");
    expect(stripAccountHint("makan 50rb").hint).toBeNull();
  });
});

describe("parseMoneyMessage account hint", () => {
  it("parses create intents with cc / debit after amount", () => {
    const cc = parseMoneyMessage(
      "pengeluaran beli recheese 50rb cc"
    );
    expect(cc).toMatchObject({
      type: "EXPENSE",
      amount: 50_000,
      description: "beli recheese",
      accountHint: "cc",
    });

    const debit = parseMoneyMessage(
      "pengeluaran beli recheese 50rb debit"
    );
    expect(debit).toMatchObject({
      type: "EXPENSE",
      amount: 50_000,
      description: "beli recheese",
      accountHint: "debit",
    });

    expect(parseTotalsQuery("pengeluaran beli recheese 50rb cc")).toBeNull();
    expect(parseTotalsQuery("pengeluaran beli recheese 50rb debit")).toBeNull();
  });

  it("still parses plain amounts", () => {
    expect(parseIdrAmount("50rb")).toBe(50_000);
    const plain = parseMoneyMessage("makan 34rb");
    expect(plain?.amount).toBe(34_000);
    expect(plain?.accountHint).toBeUndefined();
  });
});
