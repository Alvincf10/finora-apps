import { describe, expect, it } from "vitest";
import { parseTotalsQuery } from "./query-totals";
import { parseMoneyMessage } from "./parse-expense";

describe("parseTotalsQuery", () => {
  it("matches pure expense / income summary queries", () => {
    expect(parseTotalsQuery("total pengeluaran")).toEqual({
      kind: "expense",
      range: "month",
    });
    expect(parseTotalsQuery("pengeluaran hari ini")).toEqual({
      kind: "expense",
      range: "today",
    });
    expect(parseTotalsQuery("total pemasukan")).toEqual({
      kind: "income",
      range: "month",
    });
    expect(parseTotalsQuery("ringkasan")).toEqual({
      kind: "both",
      range: "month",
    });
  });

  it("does not treat create intents with amounts as totals queries", () => {
    const cases = [
      "pengeluaran beli makan siang recheese 33000",
      "pengeluaran beli makan chatime 43000",
      "expense kopi 35k",
      "pemasukan freelance 2jt",
      "income gaji 10jt",
    ];
    for (const text of cases) {
      expect(parseTotalsQuery(text), text).toBeNull();
      expect(parseMoneyMessage(text), text).not.toBeNull();
    }
  });
});
