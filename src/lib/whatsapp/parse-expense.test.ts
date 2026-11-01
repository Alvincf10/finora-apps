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

describe("parseMoneyMessage amount in the middle", () => {
  it("accepts category + amount + trailing description", () => {
    const parsed = parseMoneyMessage("belanja 115rb beli baju running");
    expect(parsed).toMatchObject({
      type: "EXPENSE",
      amount: 115_000,
      description: "belanja beli baju running",
      categoryHint: "Lifestyle",
    });

    expect(
      parseMoneyMessage("shopping 115rb beli baju running")
    ).toMatchObject({
      amount: 115_000,
      categoryHint: "Lifestyle",
      description: "shopping beli baju running",
    });
  });

  it("does not treat bare mid-message counts as money", () => {
    expect(parseMoneyMessage("beli 2 baju running")).toBeNull();
  });
});

describe("parseMoneyMessage category priority", () => {
  it("routes makan + pacar to Relationship", () => {
    expect(parseMoneyMessage("makan malem sm pacar 300rb")).toMatchObject({
      amount: 300_000,
      categoryHint: "Relationship",
      description: "makan malem sm pacar",
    });
  });

  it("routes flazz to Flazz and gojek/grab to Transport", () => {
    expect(parseMoneyMessage("topup flazz 100rb")).toMatchObject({
      amount: 100_000,
      categoryHint: "Flazz",
      description: "topup flazz",
    });
    expect(parseMoneyMessage("isi flazz 100rb")?.categoryHint).toBe("Flazz");
    expect(parseMoneyMessage("gojek 25.000")?.categoryHint).toBe("Transport");
    expect(parseMoneyMessage("grab 30rb")?.categoryHint).toBe("Transport");
    expect(parseMoneyMessage("isi bensin 200rb")?.categoryHint).toBe("Fuel");
    expect(parseMoneyMessage("bbm 150rb")?.categoryHint).toBe("Fuel");
  });

  it("keeps shopping items in Lifestyle", () => {
    expect(parseMoneyMessage("beli baju 150rb")?.categoryHint).toBe(
      "Lifestyle"
    );
    expect(parseMoneyMessage("beli parfum 250rb")?.categoryHint).toBe(
      "Lifestyle"
    );
    expect(parseMoneyMessage("beli celana 200rb")?.categoryHint).toBe(
      "Lifestyle"
    );
  });

  it("still needs an amount for topup flazz", () => {
    expect(parseMoneyMessage("topup flazz")).toBeNull();
  });
});
