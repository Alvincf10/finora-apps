import { describe, expect, it } from "vitest";
import { parseBalanceQuery } from "@/lib/whatsapp/query-balance";

describe("parseBalanceQuery", () => {
  it("matches saldo and balance forms", () => {
    expect(parseBalanceQuery("saldo")).toBe(true);
    expect(parseBalanceQuery("/saldo")).toBe(true);
    expect(parseBalanceQuery("Saldo")).toBe(true);
    expect(parseBalanceQuery("balance")).toBe(true);
    expect(parseBalanceQuery("/balance")).toBe(true);
    expect(parseBalanceQuery("cek saldo")).toBe(true);
    expect(parseBalanceQuery("cek  saldo")).toBe(true);
  });

  it("rejects non-queries", () => {
    expect(parseBalanceQuery("")).toBe(false);
    expect(parseBalanceQuery("saldoan")).toBe(false);
    expect(parseBalanceQuery("makan 50rb")).toBe(false);
  });
});
